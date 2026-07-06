import { context, propagation } from "@opentelemetry/api";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { PendingPublishQueue } from "./pending-publish-queue";
import {
	WssMessageDispatcher,
	type WssMessageHandler,
} from "./wss-message-dispatcher";
import { WssConnectionOrchestrator } from "./wss-connection-orchestrator";

export type { WssMessageHandler } from "./wss-message-dispatcher";

export class WssClient {
	private readonly _orchestrator: WssConnectionOrchestrator;
	private readonly _dispatcher: WssMessageDispatcher;
	private readonly _queue: PendingPublishQueue;
	private readonly _hasHttpFallback: boolean;

	constructor(config: {
		wssUrl: string;
		tlsConfig?: Partial<TlsPaths>;
		serviceName: string;
		instanceId: string;
		httpFallback?: (payload: unknown, metadata: MessageMetadata) => Promise<void>;
	}) {
		this._hasHttpFallback = config.httpFallback !== undefined;
		this._queue = new PendingPublishQueue(config.httpFallback);
		this._dispatcher = new WssMessageDispatcher();
		this._orchestrator = new WssConnectionOrchestrator(
			{
				wssUrl: config.wssUrl,
				tlsConfig: config.tlsConfig,
				serviceName: config.serviceName,
				instanceId: config.instanceId,
			},
			(raw) => this._dispatcher.dispatch(raw),
			this._queue
		);
	}

	connect(topics: string[] = []): void {
		this._orchestrator.connect(topics);
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
		if (
			this._orchestrator.isConnected() &&
			this._orchestrator.send({
				type: "publish",
				payload,
				metadata,
				traceparent: carrier.traceparent,
			})
		) {
			return Promise.resolve();
		}
		if (this._hasHttpFallback) {
			return this._queue.enqueueOrFallback(payload, metadata);
		}
		return Promise.reject(new Error("WSS not connected and no HTTP fallback"));
	}

	send(data: unknown): Promise<void> {
		return this.publish(data, {} as MessageMetadata);
	}

	subscribe(topics: string[]): Promise<void> {
		this._orchestrator.addTopics(topics);
		if (this._orchestrator.isConnected()) {
			this._orchestrator.send({ type: "subscribe", topics });
		}
		return Promise.resolve();
	}

	unsubscribe(topics: string[]): Promise<void> {
		this._orchestrator.removeTopics(topics);
		if (this._orchestrator.isConnected()) {
			this._orchestrator.send({ type: "unsubscribe", topics });
		}
		return Promise.resolve();
	}

	ack(messageId: string): boolean {
		return this._orchestrator.send({ type: "ack", messageId });
	}

	nack(messageId: string): boolean {
		return this._orchestrator.send({ type: "nack", messageId });
	}

	get shouldReconnect(): boolean {
		return this._orchestrator.shouldReconnect;
	}

	isConnected(): boolean {
		return this._orchestrator.isConnected();
	}

	disconnect(): void {
		this._orchestrator.stop();
		this._queue.drainToHttp();
		this._queue.stop();
		this._orchestrator.disconnect(1000, "Client shutdown");
	}
}
