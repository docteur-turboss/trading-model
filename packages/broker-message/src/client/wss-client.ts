import * as fs from "node:fs";
import * as https from "node:https";
import { context, propagation } from "@opentelemetry/api";
import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import WebSocket from "ws";
import { PendingPublishQueue } from "./pending-publish-queue";
import { WssReconnector } from "./wss-reconnector";

export type WssMessageHandler = (
	topic: string,
	payload: unknown,
	metadata: MessageMetadata
) => void;

export class WssClient {
	private _ws: WebSocket | null = null;
	private _messageHandler: WssMessageHandler | null = null;
	private _wsUrl: string;
	private _tlsCa?: string;
	private _tlsCert?: string;
	private _tlsKey?: string;
	private _serviceName: string;
	private _instanceId: string;
	private _subscribedTopics: string[] = [];
	private _connected = false;
	private _queue: PendingPublishQueue;
	private _reconnector: WssReconnector;

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
		this._queue = new PendingPublishQueue();
		this._reconnector = new WssReconnector();
		this._reconnector.onPermanentFallback(() => {
			this._queue.drainToHttp();
		});
	}

	private _buildWsUrl(): string {
		const url = new URL(this._wsUrl);
		url.searchParams.set("service", this._serviceName);
		url.searchParams.set("instance", this._instanceId);
		return url.toString();
	}

	connect(topics: string[] = []): void {
		this._subscribedTopics = topics;
		this._reconnector.shouldReconnect = true;
		this._connectWs();
	}

	private _setupWsTls(): https.Agent | undefined {
		if (!this._tlsCa) {
			return;
		}
		const tlsConfig: https.AgentOptions = {
			ca: this._tlsCa,
			cert: this._tlsCert,
			key: this._tlsKey,
		};
		return new https.Agent(tlsConfig);
	}

	private _onWsOpen(): void {
		this._connected = true;
		this._reconnector.reset();
		logger.info("WSS connected");

		if (this._subscribedTopics.length > 0) {
			this._sendJson({ type: "subscribe", topics: this._subscribedTopics });
		}

		this._flushPending();
	}

	private _onWsMessage(raw: WebSocket.RawData): void {
		try {
			const msg = JSON.parse(raw.toString());
			this._dispatchWsMessage(msg);
		} catch (err) {
			logger.warn("WSS message parse error", {
				error: normalizeError(err as Error),
			});
		}
	}

	private _dispatchWsMessage(raw: unknown): void {
		const msg = raw as Record<string, unknown>;
		if (msg.type === "message" && msg.topic) {
			const message = msg.message as
				| { payload?: unknown; metadata?: MessageMetadata }
				| undefined;
			this._messageHandler?.(
				msg.topic as string,
				message?.payload,
				message?.metadata as MessageMetadata
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
	}

	private _onWsClose(code: number, reason: Buffer): void {
		this._connected = false;
		this._ws = null;
		const reasonStr = reason?.toString() || "unknown";
		logger.warn("WSS disconnected", { code, reason: reasonStr });
		this._reconnector.schedule(() => this._connectWs());
	}

	private _onWsError(err: Error): void {
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
		this._reconnector.schedule(() => this._connectWs());
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
			attempt: this._reconnector.attempt + 1,
		});

		try {
			const agent = this._setupWsTls();

			this._ws = new WebSocket(wsUrl, { agent });

			this._ws.on("open", () => this._onWsOpen());
			this._ws.on("message", (raw: WebSocket.RawData) =>
				this._onWsMessage(raw)
			);
			this._ws.on("close", (code: number, reason: Buffer) =>
				this._onWsClose(code, reason)
			);
			this._ws.on("error", (err: Error) => this._onWsError(err));
		} catch (err) {
			this._connected = false;
			logger.warn("WSS connection failed", {
				error: normalizeError(err as Error),
			});
			this._reconnector.schedule(() => this._connectWs());
		}
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

	get httpFallback(): ((payload: unknown, metadata: MessageMetadata) => Promise<void>) | null {
		return this._queue.httpFallback;
	}

	setHttpFallback(fn: (payload: unknown, metadata: MessageMetadata) => Promise<void>): void {
		this._queue.setHttpFallback(fn);
	}

	get messageHandler(): WssMessageHandler | null {
		return this._messageHandler;
	}

	onMessage(handler: WssMessageHandler): void {
		this._messageHandler = handler;
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

		if (this._queue.httpFallback) {
			return this._queue.enqueueOrFallback(payload, metadata);
		}

		return Promise.reject(new Error("WSS not connected and no HTTP fallback"));
	}

	private _flushPending(): void {
		this._queue.flush((data) => this._sendJson(data));
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
		return this._reconnector.shouldReconnect;
	}

	isConnected(): boolean {
		return this._connected;
	}

	disconnect(): void {
		this._reconnector.stop();
		this._queue.drainToHttp();
		this._queue.stop();
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
