import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";

interface PendingPublish {
	payload: unknown;
	metadata: MessageMetadata;
	resolve: () => void;
	reject: (err: Error) => void;
	timestamp: number;
}

type SendJsonFn = (data: unknown) => boolean;
type FallbackPublishFn = (
	payload: unknown,
	metadata: MessageMetadata
) => Promise<void>;

const HTTP_RETRY_BASE_MS = 500;
const HTTP_RETRY_MAX_MS = 15000;
const HTTP_RETRY_MAX_ATTEMPTS = 5;
const WSS_PENDING_QUEUE_MAX = 1000;

export class PendingPublishQueue {
	private _pendingQueue: PendingPublish[] = [];
	private _flusherTimer: ReturnType<typeof setInterval> | null = null;
	private readonly _httpFallback: FallbackPublishFn | null;

	constructor(httpFallback?: FallbackPublishFn) {
		this._httpFallback = httpFallback ?? null;
		this._startFlusher();
	}

	get httpFallback(): FallbackPublishFn | null {
		return this._httpFallback;
	}

	get pendingCount(): number {
		return this._pendingQueue.length;
	}

	enqueue(
		payload: unknown,
		metadata: MessageMetadata
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._pendingQueue.push({ payload, metadata, resolve, reject, timestamp: Date.now() });
		});
	}

	enqueueOrFallback(
		payload: unknown,
		metadata: MessageMetadata
	): Promise<void> {
		if (this._pendingQueue.length >= WSS_PENDING_QUEUE_MAX) {
			return this._retryHttpFallback(
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
		if (!this._httpFallback && this._pendingQueue.length === 0) {
			return;
		}
		const batch = this._pendingQueue.splice(0, this._pendingQueue.length);
		const httpBatch = this._processBatch(batch, sendFn);
		for (const entry of httpBatch) {
			void this._retryHttpFallback(entry, 0);
		}
	}

	private _trySend(
		entry: PendingPublish,
		sendFn: SendJsonFn,
		httpBatch: PendingPublish[],
	): void {
		if (sendFn({ type: "publish", payload: entry.payload, metadata: entry.metadata })) {
			entry.resolve();
			return;
		}
		if (this._httpFallback) {
			httpBatch.push(entry);
			return;
		}
		entry.reject(new Error("WSS not connected"));
	}

	private _processBatch(
		batch: PendingPublish[],
		sendFn: SendJsonFn,
	): PendingPublish[] {
		const httpBatch: PendingPublish[] = [];
		for (const entry of batch) {
			this._trySend(entry, sendFn, httpBatch);
		}
		return httpBatch;
	}

	drainToHttp(): void {
		const pending = this._pendingQueue.splice(0, this._pendingQueue.length);
		for (const entry of pending) {
			if (this._httpFallback) {
				void this._retryHttpFallback(entry, 0);
			} else {
				entry.reject(
					new Error("WSS disconnected and no HTTP fallback configured")
				);
			}
		}
	}

	private _startFlusher(): void {
		this._flusherTimer = setInterval(() => {
			// Flusher is driven externally via flush() calls
		}, 50);
		this._flusherTimer.unref();
	}

	private _retryHttpFallback(
		entry: PendingPublish,
		attempt: number
	): Promise<void> {
		if (!this._httpFallback) {
			entry.reject(
				new Error("WSS disconnected and no HTTP fallback configured")
			);
			return Promise.resolve();
		}
		return this._httpFallback(entry.payload, entry.metadata)
			.then(() => {
				entry.resolve();
			})
			.catch((err) => {
				if (attempt < HTTP_RETRY_MAX_ATTEMPTS) {
					const delay = Math.min(
						HTTP_RETRY_BASE_MS * 2 ** attempt,
						HTTP_RETRY_MAX_MS
					);
					logger.warn(
						`HTTP fallback attempt ${attempt + 1} failed, retrying in ${delay}ms`,
						{
							error: normalizeError(err),
						}
					);
					return new Promise<void>((resolve) => {
						setTimeout(() => {
							resolve(this._retryHttpFallback(entry, attempt + 1));
						}, delay).unref();
					});
				}
				logger.error("HTTP fallback max retries exceeded", {
					error: normalizeError(err),
				});
				entry.reject(new Error("HTTP fallback failed after max retries"));
				return Promise.resolve();
			});
	}

	stop(): void {
		if (this._flusherTimer) {
			clearInterval(this._flusherTimer);
			this._flusherTimer = null;
		}
	}
}
