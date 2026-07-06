import { context, propagation } from "@opentelemetry/api";
import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { PendingPublishQueue } from "./pending-publish-queue";
import { WssConnection } from "./wss-connection";
import { WssReconnector } from "./wss-reconnector";
import { WssMessageDispatcher, type WssMessageHandler } from "./wss-message-dispatcher";

export type { WssMessageHandler } from "./wss-message-dispatcher";

export class WssClient {
	private readonly _connection: WssConnection;
	private readonly _wsUrl: string;
	private readonly _serviceName: string;
	private readonly _instanceId: string;
	private _subscribedTopics: string[] = [];
	private _connected = false;
	private readonly _queue: PendingPublishQueue;
	private readonly _reconnector: WssReconnector;
	private readonly _dispatcher: WssMessageDispatcher;

	constructor(config: {
		wssUrl: string;
		tlsConfig?: Partial<TlsPaths>;
		serviceName: string;
		instanceId: string;
	}) {
		this._wsUrl = config.wssUrl;
		this._serviceName = config.serviceName;
		this._instanceId = config.instanceId;
		this._connection = new WssConnection(config.tlsConfig);
		this._queue = new PendingPublishQueue();
		this._reconnector = new WssReconnector();
		this._reconnector.onPermanentFallback(() => this._queue.drainToHttp());
		this._dispatcher = new WssMessageDispatcher();
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

	private _onWsOpen(): void {
		this._connected = true;
		this._reconnector.reset();
		logger.info("WSS connected");

		if (this._subscribedTopics.length > 0) {
			this._connection.send({ type: "subscribe", topics: this._subscribedTopics });
		}

		this._flushPending();
	}

	private _onWsMessage(raw: string): void {
		this._dispatcher.dispatch(raw);
	}

	private _onWsClose(code: number, reason: Buffer): void {
		this._connected = false;
		const reasonStr = reason?.toString() || "unknown";
		logger.warn("WSS disconnected", { code, reason: reasonStr });
		this._reconnector.schedule(() => this._connectWs());
	}

	private _onWsError(err: Error): void {
		this._connected = false;
		logger.warn("WSS error", { error: err.message });
		this._reconnector.schedule(() => this._connectWs());
	}

	private _connectWs(): void {
		const wsUrl = this._buildWsUrl();
		logger.info("WSS connecting", {
			url: wsUrl,
			attempt: this._reconnector.attempt + 1,
		});
		try {
			this._connection.connect(wsUrl, {
				onOpen: () => this._onWsOpen(),
				onMessage: (raw: string) => this._onWsMessage(raw),
				onClose: (code: number, reason: Buffer) => this._onWsClose(code, reason),
				onError: (err: Error) => this._onWsError(err),
			});
		} catch (err) {
			this._connected = false;
			logger.warn("WSS connection failed", {
				error: normalizeError(err as Error),
			});
			this._reconnector.schedule(() => this._connectWs());
		}
	}

	get httpFallback(): ((payload: unknown, metadata: MessageMetadata) => Promise<void>) | null {
		return this._queue.httpFallback;
	}

	setHttpFallback(fn: (payload: unknown, metadata: MessageMetadata) => Promise<void>): void {
		this._queue.setHttpFallback(fn);
	}

	get messageHandler(): WssMessageHandler | null {
		return this._dispatcher["_messageHandler"] as WssMessageHandler | null;
	}

	onMessage(handler: WssMessageHandler): void {
		this._dispatcher.setMessageHandler(handler);
	}

	publish(payload: unknown, metadata: MessageMetadata): Promise<void> {
		const carrier: Record<string, string> = {};
		propagation.inject(context.active(), carrier);
		const traceparent = carrier.traceparent;

		if (
			this._connected &&
			this._connection.send({ type: "publish", payload, metadata, traceparent })
		) {
			return Promise.resolve();
		}

		if (this._queue.httpFallback) {
			return this._queue.enqueueOrFallback(payload, metadata);
		}

		return Promise.reject(new Error("WSS not connected and no HTTP fallback"));
	}

	private _flushPending(): void {
		this._queue.flush((data) => this._connection.send(data));
	}

	subscribe(topics: string[]): Promise<void> {
		this._subscribedTopics = [
			...new Set([...this._subscribedTopics, ...topics]),
		];
		if (this._connected) {
			this._connection.send({ type: "subscribe", topics });
		}
		return Promise.resolve();
	}

	unsubscribe(topics: string[]): Promise<void> {
		this._subscribedTopics = this._subscribedTopics.filter(
			(topic) => !topics.includes(topic)
		);
		if (this._connected) {
			this._connection.send({ type: "unsubscribe", topics });
		}
		return Promise.resolve();
	}

	ack(messageId: string): boolean {
		return this._connection.send({ type: "ack", messageId });
	}

	nack(messageId: string): boolean {
		return this._connection.send({ type: "nack", messageId });
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
		this._connection.disconnect(1000, "Client shutdown");
		this._connected = false;
	}
}
