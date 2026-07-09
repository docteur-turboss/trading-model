import { context, propagation } from "@opentelemetry/api";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { IPublishClient } from "./i-publish-client";
import type { PendingPublishQueue } from "./pending-publish-queue";
import type { WssConnectionOrchestrator } from "./wss-connection-orchestrator";

export class WssPublishClient implements IPublishClient {
	constructor(
		private readonly _orchestrator: WssConnectionOrchestrator,
		private readonly _queue: PendingPublishQueue
	) {}

	get httpFallback():
		| ((payload: unknown, metadata: MessageMetadata) => Promise<void>)
		| null {
		return this._queue.httpFallback;
	}

	private _trySendWs(
		payload: unknown,
		metadata: MessageMetadata,
		carrier: Record<string, string>
	): boolean {
		return (
			this._orchestrator.isConnected() &&
			this._orchestrator.send({
				type: "publish",
				payload,
				metadata,
				traceparent: carrier.traceparent,
			})
		);
	}

	publish(payload: unknown, metadata: MessageMetadata): Promise<void> {
		const carrier: Record<string, string> = {};
		propagation.inject(context.active(), carrier);
		if (this._trySendWs(payload, metadata, carrier)) {
			return Promise.resolve();
		}
		if (this._queue.hasHttpFallback) {
			return this._queue.enqueueOrFallback(payload, metadata);
		}
		return Promise.reject(new Error("WSS not connected and no HTTP fallback"));
	}
}
