import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { PendingPublishQueue } from "./pending-publish-queue";
import type { WssClientConfig } from "./wss-connection-lifecycle";
import { WssConnectionOrchestrator } from "./wss-connection-orchestrator";
import {
	WssMessageDispatcher,
	type WssMessageHandler,
} from "./wss-message-dispatcher";
import { WssPublishClient } from "./wss-publisher";

export type { WssMessageHandler } from "./wss-message-dispatcher";

export class WssClient {
	private readonly _orchestrator: WssConnectionOrchestrator;
	private readonly _dispatcher: WssMessageDispatcher;
	private readonly _queue: PendingPublishQueue;
	private readonly _publisher: WssPublishClient;

	constructor(
		config: WssClientConfig & {
			httpFallback?: (
				payload: unknown,
				metadata: MessageMetadata
			) => Promise<void>;
		}
	) {
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
		this._publisher = new WssPublishClient(this._orchestrator, this._queue);
	}

	connect(topics: string[] = []): void {
		this._orchestrator.connect(topics);
	}

	get httpFallback():
		| ((payload: unknown, metadata: MessageMetadata) => Promise<void>)
		| null {
		return this._publisher.httpFallback;
	}

	get messageHandler(): WssMessageHandler | null {
		return this._dispatcher.messageHandler as WssMessageHandler | null;
	}

	onMessage(handler: WssMessageHandler): void {
		this._dispatcher.setMessageHandler(handler);
	}

	publish(payload: unknown, metadata: MessageMetadata): Promise<void> {
		return this._publisher.publish(payload, metadata);
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
