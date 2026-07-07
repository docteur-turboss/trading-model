import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { normalizeError } from "@trading-model/common/utils/errors";

interface PendingPublish {
	payload: unknown;
	metadata: MessageMetadata;
	resolve: () => void;
	reject: (err: Error) => void;
	timestamp: number;
}

type SendJsonFn = (data: unknown) => boolean;
export type FallbackPublishFn = (
	payload: unknown,
	metadata: MessageMetadata
) => Promise<void>;

const HTTP_RETRY_BASE_MS = 500;
const HTTP_RETRY_MAX_MS = 15000;
const HTTP_RETRY_MAX_ATTEMPTS = 5;

const NULL_HTTP_FALLBACK: FallbackPublishFn = async (_payload, _metadata) => {
	throw new Error("WSS disconnected and no HTTP fallback configured");
};

export class HttpFallbackHandler {
	private readonly _httpFallback: FallbackPublishFn;

	constructor(httpFallback?: FallbackPublishFn) {
		this._httpFallback = httpFallback ?? NULL_HTTP_FALLBACK;
	}

	get httpFallback(): FallbackPublishFn {
		return this._httpFallback;
	}

	get hasHttpFallback(): boolean {
		return this._httpFallback !== NULL_HTTP_FALLBACK;
	}

	processBatch(batch: PendingPublish[], sendFn: SendJsonFn): PendingPublish[] {
		const httpBatch: PendingPublish[] = [];
		for (const entry of batch) {
			this._trySend(entry, sendFn, httpBatch);
		}
		return httpBatch;
	}

	private _trySend(
		entry: PendingPublish,
		sendFn: SendJsonFn,
		httpBatch: PendingPublish[]
	): void {
		if (
			sendFn({
				type: "publish",
				payload: entry.payload,
				metadata: entry.metadata,
			})
		) {
			entry.resolve();
			return;
		}
		httpBatch.push(entry);
	}

	retry(entry: PendingPublish, attempt: number): Promise<void> {
		return this._httpFallback(entry.payload, entry.metadata)
			.then(() => {
				entry.resolve();
			})
			.catch((err) => {
				if (this._shouldRejectImmediately(entry, attempt)) {
					return;
				}
				if (attempt < HTTP_RETRY_MAX_ATTEMPTS) {
					return this._scheduleRetry(entry, attempt, err);
				}
				this._rejectMaxRetries(entry, err);
			});
	}

	private _shouldRejectImmediately(
		entry: PendingPublish,
		attempt: number
	): boolean {
		if (attempt === 0 && this._httpFallback === NULL_HTTP_FALLBACK) {
			entry.reject(
				new Error("WSS disconnected and no HTTP fallback configured")
			);
			return true;
		}
		return false;
	}

	private _scheduleRetry(
		entry: PendingPublish,
		attempt: number,
		err: unknown
	): Promise<void> {
		const delay = _computeRetryDelay(attempt);
		logger.warn(
			`HTTP fallback attempt ${attempt + 1} failed, retrying in ${delay}ms`,
			{ error: normalizeError(err) }
		);
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				resolve(this.retry(entry, attempt + 1));
			}, delay).unref();
		});
	}

	private _rejectMaxRetries(entry: PendingPublish, err: unknown): void {
		logger.error("HTTP fallback max retries exceeded", {
			error: normalizeError(err),
		});
		entry.reject(new Error("HTTP fallback failed after max retries"));
	}

	drainToHttp(entries: PendingPublish[]): void {
		for (const entry of entries) {
			void this.retry(entry, 0);
		}
	}
}

function _computeRetryDelay(attempt: number): number {
	return Math.min(HTTP_RETRY_BASE_MS * 2 ** attempt, HTTP_RETRY_MAX_MS);
}
