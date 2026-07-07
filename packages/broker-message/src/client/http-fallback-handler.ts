import { logger } from "@trading-model/common/config/logger";
import type { MessageMetadata } from "@trading-model/common/contracts/message.types";
import { normalizeError } from "@trading-model/common/utils/errors";

export interface PendingPublish {
	payload: unknown;
	metadata: MessageMetadata;
	resolve: () => void;
	reject: (err: Error) => void;
	timestamp: number;
}
export type SendJsonFn = (data: unknown) => boolean;
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
function _computeRetryDelay(attempt: number): number {
	return Math.min(HTTP_RETRY_BASE_MS * 2 ** attempt, HTTP_RETRY_MAX_MS);
}

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
			if (
				sendFn({
					type: "publish",
					payload: entry.payload,
					metadata: entry.metadata,
				})
			) {
				entry.resolve();
			} else {
				httpBatch.push(entry);
			}
		}
		return httpBatch;
	}

	private _rejectNoFallback(entry: PendingPublish): void {
		entry.reject(
			new Error("WSS disconnected and no HTTP fallback configured")
		);
	}

	private async _retryWithBackoff(entry: PendingPublish, attempt: number, err: unknown): Promise<void> {
		if (attempt < HTTP_RETRY_MAX_ATTEMPTS) {
			const delay = _computeRetryDelay(attempt);
			logger.warn(
				`HTTP fallback attempt ${attempt + 1} failed, retrying in ${delay}ms`,
				{ error: normalizeError(err) }
			);
			await new Promise<void>((resolve) => {
				setTimeout(resolve, delay).unref();
			});
			return this.retry(entry, attempt + 1);
		}
		logger.error("HTTP fallback max retries exceeded", {
			error: normalizeError(err),
		});
		entry.reject(new Error("HTTP fallback failed after max retries"));
	}

	async retry(entry: PendingPublish, attempt: number): Promise<void> {
		try {
			await this._httpFallback(entry.payload, entry.metadata);
			entry.resolve();
		} catch (err) {
			if (attempt === 0 && this._httpFallback === NULL_HTTP_FALLBACK) {
				this._rejectNoFallback(entry);
				return;
			}
			await this._retryWithBackoff(entry, attempt, err);
		}
	}

	drainToHttp(entries: PendingPublish[]): void {
		for (const entry of entries) {
			void this.retry(entry, 0);
		}
	}
}
