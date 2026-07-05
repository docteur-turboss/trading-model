import * as fs from "node:fs";
import * as https from "node:https";
import { context, propagation } from "@opentelemetry/api";
import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import {
	scheduleWsReconnect,
	type WsReconnectState,
} from "@trading-model/common/utils/ws-reconnect";
import WebSocket from "ws";

const WSS_RECONNECT_BASE_MS = 1000;
const WSS_RECONNECT_MAX_MS = 30000;
const WSS_MAX_RECONNECT_ATTEMPTS = 20;
const WSS_RECONNECT_POLL_INTERVAL_MS = 60_000;

const HTTP_RETRY_BASE_MS = 500;
const HTTP_RETRY_MAX_MS = 15000;
const HTTP_RETRY_MAX_ATTEMPTS = 5;

export type WssMessageHandler = (
	topic: string,
	payload: unknown,
	metadata: MessageMetadata
) => void;

interface PendingPublish {
	payload: unknown;
	metadata: MessageMetadata;
	resolve: () => void;
	reject: (err: Error) => void;
	timestamp: number;
}

const WSS_PENDING_QUEUE_MAX = 1000;

type FallbackPublishFn = (
	payload: unknown,
	metadata: MessageMetadata
) => Promise<void>;

export class WssClient {
	private _ws: WebSocket | null = null;
	private _shouldReconnect = true;
	private _wsReconnectState: WsReconnectState = {
		attempt: 0,
		timer: null,
		destroyed: false,
	};
	private _permanentlyFellBack = false;
	private _reconnectPollTimer: ReturnType<typeof setInterval> | null = null;
	private _messageHandler: WssMessageHandler | null = null;
	private _pendingQueue: PendingPublish[] = [];
	private _flusherTimer: ReturnType<typeof setInterval> | null = null;
	private _wsUrl: string;
	private _tlsCa?: string;
	private _tlsCert?: string;
	private _tlsKey?: string;
	private _serviceName: string;
	private _instanceId: string;
	private _subscribedTopics: string[] = [];
	private _connected = false;
	private _httpFallback: FallbackPublishFn | null = null;

	constructor(config: {
		wssUrl: string;
		tlsConfig: { ca?: string; cert?: string; key?: string };
		serviceName: string;
		instanceId: string;
	}) {
		this._wsUrl = config.wssUrl;
		this._serviceName = config.serviceName;
		this._instanceId = config.instanceId;
		this._tlsCa = config.tlsConfig.ca
			? fs.readFileSync(config.tlsConfig.ca, "utf8")
			: undefined;
		this._tlsCert = config.tlsConfig.cert
			? fs.readFileSync(config.tlsConfig.cert, "utf8")
			: undefined;
		this._tlsKey = config.tlsConfig.key
			? fs.readFileSync(config.tlsConfig.key, "utf8")
			: undefined;
		this._startFlusher();
	}

	private _buildWsUrl(): string {
		const url = new URL(this._wsUrl);
		url.searchParams.set("service", this._serviceName);
		url.searchParams.set("instance", this._instanceId);
		return url.toString();
	}

	connect(topics: string[] = []): void {
		this._subscribedTopics = topics;
		this._shouldReconnect = true;
		this._connectWs();
	}

	private _connectWs(): void {
		if (this._ws) {
			try {
				this._ws.close();
			} catch {
				logger.warn("Failed to close existing WSS connection");
			}
			this._ws = null;
		}

		const wsUrl = this._buildWsUrl();
		logger.info("WSS connecting", {
			url: wsUrl,
			attempt: this._wsReconnectState.attempt + 1,
		});

		try {
			const tlsConfig: https.AgentOptions = {};
			let agent: https.Agent | undefined;

			if (this._tlsCa) {
				tlsConfig.ca = this._tlsCa;
				tlsConfig.cert = this._tlsCert;
				tlsConfig.key = this._tlsKey;
				agent = new https.Agent(tlsConfig);
			}

			this._ws = new WebSocket(wsUrl, { agent });

			this._ws.on("open", () => {
				this._connected = true;
				this._wsReconnectState.attempt = 0;
				logger.info("WSS connected");

				if (this._subscribedTopics.length > 0) {
					this._sendJson({ type: "subscribe", topics: this._subscribedTopics });
				}

				this._flushPending();
			});

			this._ws.on("message", (raw: WebSocket.RawData) => {
				try {
					const msg = JSON.parse(raw.toString());
					if (msg.type === "message" && msg.topic) {
						this._messageHandler?.(
							msg.topic,
							msg.message?.payload,
							msg.message?.metadata
						);
					} else if (msg.type === "connected") {
						logger.info("WSS handshake complete", {
							brokerInstance: msg.instanceId,
						});
					} else if (msg.type === "subscribed") {
						logger.info("WSS topics subscribed", { topics: msg.topics });
					} else if (msg.type === "error") {
						logger.warn("WSS server error", { message: msg.message });
					}
				} catch (err) {
					logger.warn("WSS message parse error", {
						error: normalizeError(err as Error),
					});
				}
			});

			this._ws.on("close", (code: number, reason: Buffer) => {
				this._connected = false;
				this._ws = null;
				const reasonStr = reason?.toString() || "unknown";
				logger.warn("WSS disconnected", { code, reason: reasonStr });
				this._scheduleReconnect();
			});

			this._ws.on("error", (err: Error) => {
				this._connected = false;
				logger.warn("WSS error", { error: err.message });
				if (this._ws) {
					try {
						this._ws.close();
					} catch {
						/* ignore */
					}
					this._ws = null;
				}
				this._scheduleReconnect();
			});
		} catch (err) {
			this._connected = false;
			logger.warn("WSS connection failed", {
				error: normalizeError(err as Error),
			});
			this._scheduleReconnect();
		}
	}

	private _scheduleReconnect(): void {
		if (!this._shouldReconnect) {
			return;
		}
		if (this._wsReconnectState.attempt >= WSS_MAX_RECONNECT_ATTEMPTS) {
			if (!this._permanentlyFellBack) {
				this._permanentlyFellBack = true;
				logger.warn(
					"WSS max reconnect attempts reached, falling back to HTTP — will periodically retry WSS"
				);
				this._flushAllPendingToHttp();
				this._startReconnectPolling();
			}
			return;
		}
		scheduleWsReconnect(
			this._wsReconnectState,
			{
				baseDelayMs: WSS_RECONNECT_BASE_MS,
				maxDelayMs: WSS_RECONNECT_MAX_MS,
				jitterMs: 1000,
			},
			() => this._connectWs(),
			logger
		);
	}

	private _startReconnectPolling(): void {
		if (this._reconnectPollTimer) {
			return;
		}
		this._reconnectPollTimer = setInterval(() => {
			if (!this._shouldReconnect) {
				this._stopReconnectPolling();
				return;
			}
			logger.info(
				"WSS reconnect poll — attempting to re-establish WebSocket connection"
			);
			this._wsReconnectState.attempt = 0;
			this._permanentlyFellBack = false;
			this._connectWs();
		}, WSS_RECONNECT_POLL_INTERVAL_MS);
		this._reconnectPollTimer.unref();
	}

	private _stopReconnectPolling(): void {
		if (this._reconnectPollTimer) {
			clearInterval(this._reconnectPollTimer);
			this._reconnectPollTimer = null;
		}
	}

	private _flushAllPendingToHttp(): void {
		const pending = this._pendingQueue.splice(0, this._pendingQueue.length);
		for (const entry of pending) {
			if (this._httpFallback) {
				void this._retryHttpFallback(entry, 0);
			} else {
				entry.reject(
					new Error("WSS disconnected and no HTTP fallback configured")
				);
			}
		}
	}

	private _retryHttpFallback(
		entry: PendingPublish,
		attempt: number
	): Promise<void> {
		if (!this._httpFallback) {
			entry.reject(
				new Error("WSS disconnected and no HTTP fallback configured")
			);
			return Promise.resolve();
		}
		return this._httpFallback(entry.payload, entry.metadata)
			.then(() => {
				entry.resolve();
			})
			.catch((err) => {
				if (attempt < HTTP_RETRY_MAX_ATTEMPTS) {
					const delay = Math.min(
						HTTP_RETRY_BASE_MS * 2 ** attempt,
						HTTP_RETRY_MAX_MS
					);
					logger.warn(
						`HTTP fallback attempt ${attempt + 1} failed, retrying in ${delay}ms`,
						{
							error: normalizeError(err),
						}
					);
					return new Promise<void>((resolve) => {
						setTimeout(() => {
							resolve(this._retryHttpFallback(entry, attempt + 1));
						}, delay).unref();
					});
				}
				logger.error("HTTP fallback max retries exceeded", {
					error: normalizeError(err),
				});
				entry.reject(new Error("HTTP fallback failed after max retries"));
				return Promise.resolve();
			});
	}

	get httpFallback(): FallbackPublishFn | null {
		return this._httpFallback;
	}

	setHttpFallback(fn: FallbackPublishFn): void {
		this._httpFallback = fn;
	}

	get messageHandler(): WssMessageHandler | null {
		return this._messageHandler;
	}

	onMessage(handler: WssMessageHandler): void {
		this._messageHandler = handler;
	}

	private _sendJson(data: unknown): boolean {
		if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
			return false;
		}
		try {
			this._ws.send(JSON.stringify(data));
			return true;
		} catch {
			return false;
		}
	}

	publish(payload: unknown, metadata: MessageMetadata): Promise<void> {
		const carrier: Record<string, string> = {};
		propagation.inject(context.active(), carrier);
		const traceparent = carrier.traceparent;

		if (
			this._connected &&
			this._sendJson({ type: "publish", payload, metadata, traceparent })
		) {
			return Promise.resolve();
		}

		if (this._httpFallback) {
			if (this._pendingQueue.length >= WSS_PENDING_QUEUE_MAX) {
				return this._retryHttpFallback(
					{
						payload,
						metadata,
						resolve: () => {},
						reject: () => {},
						timestamp: Date.now(),
					},
					0
				);
			}
			return new Promise<void>((resolve, reject) => {
				this._pendingQueue.push({
					payload,
					metadata,
					resolve,
					reject,
					timestamp: Date.now(),
				});
			});
		}

		return Promise.reject(new Error("WSS not connected and no HTTP fallback"));
	}

	private _flushPending(): void {
		const batch = this._pendingQueue.splice(0, this._pendingQueue.length);

		const httpBatch: PendingPublish[] = [];
		for (const entry of batch) {
			if (
				this._connected &&
				this._sendJson({
					type: "publish",
					payload: entry.payload,
					metadata: entry.metadata,
				})
			) {
				entry.resolve();
			} else if (this._httpFallback) {
				httpBatch.push(entry);
			} else {
				entry.reject(new Error("WSS not connected"));
			}
		}

		for (const entry of httpBatch) {
			void this._retryHttpFallback(entry, 0);
		}
	}

	private _startFlusher(): void {
		this._flusherTimer = setInterval(() => {
			if (this._pendingQueue.length > 0) {
				this._flushPending();
			}
		}, 50);
		this._flusherTimer.unref();
	}

	subscribe(topics: string[]): Promise<void> {
		this._subscribedTopics = [
			...new Set([...this._subscribedTopics, ...topics]),
		];
		if (this._connected) {
			this._sendJson({ type: "subscribe", topics });
		}
		return Promise.resolve();
	}

	unsubscribe(topics: string[]): Promise<void> {
		this._subscribedTopics = this._subscribedTopics.filter(
			(topic) => !topics.includes(topic)
		);
		if (this._connected) {
			this._sendJson({ type: "unsubscribe", topics });
		}
		return Promise.resolve();
	}

	ack(messageId: string): boolean {
		return this._sendJson({ type: "ack", messageId });
	}

	nack(messageId: string): boolean {
		return this._sendJson({ type: "nack", messageId });
	}

	get shouldReconnect(): boolean {
		return this._shouldReconnect;
	}

	isConnected(): boolean {
		return this._connected;
	}

	disconnect(): void {
		this._shouldReconnect = false;
		this._wsReconnectState.destroyed = true;
		if (this._wsReconnectState.timer) {
			clearTimeout(this._wsReconnectState.timer);
			this._wsReconnectState.timer = null;
		}
		this._stopReconnectPolling();
		if (this._flusherTimer) {
			clearInterval(this._flusherTimer);
			this._flusherTimer = null;
		}
		const pending = this._pendingQueue.splice(0, this._pendingQueue.length);
		for (const entry of pending) {
			void this._retryHttpFallback(entry, 0);
		}
		if (this._ws) {
			try {
				this._ws.close(1000, "Client shutdown");
			} catch {
				/* ignore */
			}
			this._ws = null;
		}
		this._connected = false;
	}
}
