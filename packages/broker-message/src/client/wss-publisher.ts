import { context, propagation } from "@opentelemetry/api";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { WssConnectionOrchestrator } from "./wss-connection-orchestrator";
import { PendingPublishQueue } from "./pending-publish-queue";

export class WssPublisher {
	private readonly _hasHttpFallback: boolean;

	constructor(
		private readonly _orchestrator: WssConnectionOrchestrator,
		private readonly _queue: PendingPublishQueue,
	) {
		this._hasHttpFallback = _queue.httpFallback !== null;
	}

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
		if (this._hasHttpFallback) {
			return this._queue.enqueueOrFallback(payload, metadata);
		}
		return Promise.reject(new Error("WSS not connected and no HTTP fallback"));
	}

	send(data: unknown): Promise<void> {
		return this.publish(data, {} as MessageMetadata);
	}
}
