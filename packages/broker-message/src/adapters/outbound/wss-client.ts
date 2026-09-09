import type { Topic } from "@trading-model/common/domain/primitives";
import type { MessageMetadata } from "@trading-model/validation/domain/contracts/message.types";
import type { IMessageClient } from "../../domain/ports/i-message-client";
import {
	WssMessageDispatcher,
	type WssMessageHandler,
} from "../inbound/wss-message-dispatcher";
import { PendingPublishQueue } from "./pending-publish-queue";
import type { WssClientConfig } from "./wss-connection-orchestrator";
import { WssConnectionOrchestrator } from "./wss-connection-orchestrator";
import { WssPublishClient } from "./wss-publisher";

export type { WssMessageHandler } from "../inbound/wss-message-dispatcher";

export class WssClient implements IMessageClient {
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

	connect(topics: Topic[] = []): void {
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

	subscribe(topics: readonly string[]): Promise<void> {
		this._orchestrator.addTopics(topics as Topic[]);
		if (this._orchestrator.isConnected()) {
			this._orchestrator.send({ type: "subscribe", topics: topics as Topic[] });
		}
		return Promise.resolve();
	}

	unsubscribe(topics: readonly string[]): Promise<void> {
		this._orchestrator.removeTopics(topics as Topic[]);
		if (this._orchestrator.isConnected()) {
			this._orchestrator.send({
				type: "unsubscribe",
				topics: topics as Topic[],
			});
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
