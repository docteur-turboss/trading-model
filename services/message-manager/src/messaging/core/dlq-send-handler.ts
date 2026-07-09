import type { HttpClient } from "@trading-model/common/config/http-client";
import { HttpMethod } from "@trading-model/common/config/http-types";
import {
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { logger } from "../../config/logger";
import type { DlqEntry } from "./dlq-repository";
import { DlqRetryWithBackoff } from "./dlq-retry-with-backoff";
import { signedOptions } from "./request-signer";

export class DlqSendHandler {
	private readonly _retry: DlqRetryWithBackoff;

	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _serviceUrl: string
	) {
		this._retry = new DlqRetryWithBackoff();
	}

	async doSend(entry: DlqEntry): Promise<void> {
		await this._postEntry(entry);
		logger.info("DLQ entry sent to DLQ service", {
			context: { reason: entry.reason },
		});
	}

	async handleSendError(
		entry: DlqEntry,
		err: Error,
		attempt: number,
		maxRetries: number
	): Promise<void> {
		if (attempt <= maxRetries) {
			const delay = this._retry.computeDelay(attempt);
			logger.warn("Retrying DLQ send after error", {
				context: {
					attempt,
					delay,
					reason: entry.reason,
					error: normalizeError(err),
				},
			});
			await this._retry.wait(delay);
			return this._doRetrySend(entry, attempt, maxRetries);
		}
		logger.error("Failed to send DLQ entry to service after retries", {
			context: {
				error: normalizeError(err),
				reason: entry.reason,
			},
		});
		throw messageManagerError("Failed to send DLQ entry", { cause: err });
	}

	private async _doRetrySend(
		entry: DlqEntry,
		attempt: number,
		maxRetries: number
	): Promise<void> {
		try {
			await this._postEntry(entry);
			logger.info("DLQ entry sent to DLQ service", {
				context: { reason: entry.reason },
			});
		} catch (retryErr) {
			return this.handleSendError(
				entry,
				retryErr as Error,
				attempt + 1,
				maxRetries
			);
		}
	}

	private async _postEntry(entry: DlqEntry): Promise<void> {
		await this._httpClient.post(
			`${this._serviceUrl}/dlq`,
			entry,
			signedOptions({
				method: HttpMethod.Post,
				path: "/dlq",
				body: entry,
				extra: { timeoutMs: 5000 },
			})
		);
	}
}
