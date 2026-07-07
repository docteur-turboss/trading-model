import { context, propagation } from "@opentelemetry/api";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { PendingPublishQueue } from "./pending-publish-queue";
import type { WssConnectionOrchestrator } from "./wss-connection-orchestrator";

export class WssPublisher {
	constructor(
		private readonly _orchestrator: WssConnectionOrchestrator,
		private readonly _queue: PendingPublishQueue
	) {}

	get httpFallback():
		| ((payload: unknown, metadata: MessageMetadata) => Promise<void>)
		| null {
		return this._queue.httpFallback;
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
		if (this._queue.hasHttpFallback) {
			return this._queue.enqueueOrFallback(payload, metadata);
		}
		return Promise.reject(new Error("WSS not connected and no HTTP fallback"));
	}

}
