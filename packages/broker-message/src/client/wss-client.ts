import { context, propagation } from "@opentelemetry/api";
import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { PendingPublishQueue } from "./pending-publish-queue";
import { WssConnectionLifecycle } from "./wss-connection-lifecycle";
import {
	WssMessageDispatcher,
	type WssMessageHandler,
} from "./wss-message-dispatcher";
import { WssReconnector } from "./wss-reconnector";

export type { WssMessageHandler } from "./wss-message-dispatcher";

export class WssClient {
	private readonly _lifecycle: WssConnectionLifecycle;
	private readonly _reconnector: WssReconnector;
	private readonly _dispatcher: WssMessageDispatcher;
	private readonly _queue: PendingPublishQueue;
	private _subscribedTopics: string[] = [];

	constructor(config: {
		wssUrl: string;
		tlsConfig?: Partial<TlsPaths>;
		serviceName: string;
		instanceId: string;
		httpFallback?: (payload: unknown, metadata: MessageMetadata) => Promise<void>;
	}) {
		const httpFallback = config.httpFallback;
		this._queue = new PendingPublishQueue(httpFallback);
		this._reconnector = new WssReconnector();
		this._dispatcher = new WssMessageDispatcher();
		this._lifecycle = new WssConnectionLifecycle(config, {
			onOpen: () => this._onWsOpen(),
			onMessage: (raw) => this._dispatcher.dispatch(raw),
			onClose: (code, reason) => this._onWsClose(code, reason),
			onError: (err) => this._onWsError(err),
		});
	}

	connect(topics: string[] = []): void {
		this._subscribedTopics = topics;
		this._reconnector.shouldReconnect = true;
		this._connectWs();
	}

	private _connectWs(): void {
		logger.info("WSS connecting", {
			url: this._lifecycle.builtUrl,
			attempt: this._reconnector.attempt + 1,
		});
		try {
			this._lifecycle.connect();
		} catch (err) {
			logger.warn("WSS connection failed", {
				error: normalizeError(err as Error),
			});
			this._scheduleReconnect();
		}
	}

	private _onWsOpen(): void {
		this._reconnector.reset();
		logger.info("WSS connected");

		if (this._subscribedTopics.length > 0) {
			this._lifecycle.send({
				type: "subscribe",
				topics: this._subscribedTopics,
			});
		}

		this._flushPending();
	}

	private _onWsClose(code: number, reason: Buffer): void {
		const reasonStr = reason?.toString() || "unknown";
		logger.warn("WSS disconnected", { code, reason: reasonStr });
		this._scheduleReconnect();
	}

	private _onWsError(err: Error): void {
		logger.warn("WSS error", { error: err.message });
		this._scheduleReconnect();
	}

	private _scheduleReconnect(): void {
		this._reconnector.schedule(() => this._connectWs(), () => this._queue.drainToHttp());
	}

	get httpFallback():
		| ((payload: unknown, metadata: MessageMetadata) => Promise<void>)
		| null {
		return this._queue.httpFallback;
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
			this._lifecycle.isConnected() &&
			this._lifecycle.send({ type: "publish", payload, metadata, traceparent })
		) {
			return Promise.resolve();
		}

		if (this._queue.httpFallback) {
			return this._queue.enqueueOrFallback(payload, metadata);
		}

		return Promise.reject(new Error("WSS not connected and no HTTP fallback"));
	}

	private _flushPending(): void {
		this._queue.flush((data) => this._lifecycle.send(data));
	}

	subscribe(topics: string[]): Promise<void> {
		this._subscribedTopics = [
			...new Set([...this._subscribedTopics, ...topics]),
		];
		if (this._lifecycle.isConnected()) {
			this._lifecycle.send({ type: "subscribe", topics });
		}
		return Promise.resolve();
	}

	unsubscribe(topics: string[]): Promise<void> {
		this._subscribedTopics = this._subscribedTopics.filter(
			(topic) => !topics.includes(topic)
		);
		if (this._lifecycle.isConnected()) {
			this._lifecycle.send({ type: "unsubscribe", topics });
		}
		return Promise.resolve();
	}

	ack(messageId: string): boolean {
		return this._lifecycle.send({ type: "ack", messageId });
	}

	nack(messageId: string): boolean {
		return this._lifecycle.send({ type: "nack", messageId });
	}

	get shouldReconnect(): boolean {
		return this._reconnector.shouldReconnect;
	}

	isConnected(): boolean {
		return this._lifecycle.isConnected();
	}

	disconnect(): void {
		this._reconnector.stop();
		this._queue.drainToHttp();
		this._queue.stop();
		this._lifecycle.disconnect(1000, "Client shutdown");
	}
}
