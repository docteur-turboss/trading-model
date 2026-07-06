import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import type { UnixTimestamp } from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

import {
	type FallbackPublishFn,
	HttpFallbackHandler,
} from "./http-fallback-handler";

interface PendingPublish {
	payload: unknown;
	metadata: MessageMetadata;
	resolve: () => void;
	reject: (err: Error) => void;
	timestamp: UnixTimestamp;
}

type SendJsonFn = (data: unknown) => boolean;

const WSS_PENDING_QUEUE_MAX = 1000;

export class PendingPublishQueue {
	private _pendingQueue: PendingPublish[] = [];
	private readonly _flusherTimer = new TimerHandle();
	private readonly _httpFallbackHandler: HttpFallbackHandler;

	constructor(httpFallback?: FallbackPublishFn) {
		this._httpFallbackHandler = new HttpFallbackHandler(httpFallback);
		this._startFlusher();
	}

	get httpFallback(): FallbackPublishFn {
		return this._httpFallbackHandler.httpFallback;
	}

	get hasHttpFallback(): boolean {
		return this._httpFallbackHandler.hasHttpFallback;
	}

	get pendingCount(): number {
		return this._pendingQueue.length;
	}

	enqueue(payload: unknown, metadata: MessageMetadata): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._pendingQueue.push({
				payload,
				metadata,
				resolve,
				reject,
				timestamp: Date.now() as UnixTimestamp,
			});
		});
	}

	enqueueOrFallback(
		payload: unknown,
		metadata: MessageMetadata
	): Promise<void> {
		if (this._pendingQueue.length >= WSS_PENDING_QUEUE_MAX) {
			return this._httpFallbackHandler.retry(
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
		return this.enqueue(payload, metadata);
	}

	flush(sendFn: SendJsonFn): void {
		if (this._pendingQueue.length === 0) {
			return;
		}
		const batch = this._pendingQueue.splice(0, this._pendingQueue.length);
		const httpBatch = this._httpFallbackHandler.processBatch(batch, sendFn);
		for (const entry of httpBatch) {
			void this._httpFallbackHandler.retry(entry, 0);
		}
	}

	drainToHttp(): void {
		const pending = this._pendingQueue.splice(0, this._pendingQueue.length);
		this._httpFallbackHandler.drainToHttp(pending);
	}

	private _startFlusher(): void {
		this._flusherTimer.startInterval(() => {
			// Flusher is driven externally via flush() calls
		}, 50);
		this._flusherTimer.unref();
	}

	stop(): void {
		this._flusherTimer.stop();
	}
}
