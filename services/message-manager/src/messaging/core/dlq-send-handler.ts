import type { HttpClient } from "@trading-model/common/config/http-client";
import type { HttpMethod } from "@trading-model/common/config/http-types";
import {
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { logger } from "../../config/logger";
import type { DlqEntry } from "./dlq-repository";
import { signedOptions } from "./request-signer";

export class DlqSendHandler {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _serviceUrl: string
	) {}

	async doSend(entry: DlqEntry): Promise<void> {
		await this._httpClient.post(
			`${this._serviceUrl}/dlq`,
			entry,
			signedOptions({
				method: "POST" as HttpMethod,
				path: "/dlq",
				body: entry,
				extra: { timeoutMs: 5000 },
			})
		);
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
			await this._retrySend(entry, err, attempt, maxRetries);
			return;
		}
		logger.error("Failed to send DLQ entry to service after retries", {
			context: {
				error: normalizeError(err),
				reason: entry.reason,
			},
		});
		throw messageManagerError("Failed to send DLQ entry", { cause: err });
	}

	private async _retrySend(
		entry: DlqEntry,
		err: Error,
		attempt: number,
		maxRetries: number
	): Promise<void> {
		const delay = Math.round(
			Math.min(200 * 2 ** (attempt - 1), 5000) * (0.5 + Math.random() * 0.5)
		);
		logger.warn("Retrying DLQ send after error", {
			context: {
				attempt,
				delay,
				reason: entry.reason,
				error: normalizeError(err),
			},
		});
		await new Promise((resolve) => setTimeout(resolve, delay));
		return this._httpClient
			.post(
				`${this._serviceUrl}/dlq`,
				entry,
				signedOptions({
					method: "POST",
					path: "/dlq",
					body: entry,
					extra: { timeoutMs: 5000 },
				})
			)
			.then(() => {
				logger.info("DLQ entry sent to DLQ service", {
					context: { reason: entry.reason },
				});
			})
			.catch((retryErr) =>
				this.handleSendError(entry, retryErr as Error, attempt + 1, maxRetries)
			);
	}

	buildReplayUrl(topic?: string, limit = 100): string {
		const params = new URLSearchParams();
		if (topic) {
			params.set("topic", topic);
		}
		params.set("limit", limit.toString());
		return `${this._serviceUrl}/dlq?${params.toString()}`;
	}
}
