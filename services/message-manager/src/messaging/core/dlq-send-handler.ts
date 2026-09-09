import type { HttpClient } from "@trading-model/common/config/http-client";
import { HttpMethod } from "@trading-model/common/config/http-types";
import type { PositiveInt } from "@trading-model/common/domain/primitives";
import { DurationMs, URLString } from "@trading-model/common/domain/primitives";
import {
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import type { DlqEntry } from "../../adapters/outbound/dlq-repository";
import { signedOptions } from "../../adapters/outbound/request-signer";
import { logger } from "../../config/logger";
import { computeDelay } from "./dlq-retry-with-backoff";

export class DlqSendHandler {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _serviceUrl: string
	) {}

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
		maxRetries: PositiveInt
	): Promise<void> {
		if (attempt <= maxRetries) {
			const delay = computeDelay(attempt);
			logger.warn("Retrying DLQ send after error", {
				context: {
					attempt,
					delay,
					reason: entry.reason,
					error: normalizeError(err),
				},
			});
			await sleep(delay);
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
		maxRetries: PositiveInt
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
			URLString.of(`${this._serviceUrl}/dlq`),
			entry,
			signedOptions({
				method: HttpMethod.Post,
				path: "/dlq",
				body: entry,
				extra: { timeoutMs: DurationMs.of(5000) },
			})
		);
	}
}
