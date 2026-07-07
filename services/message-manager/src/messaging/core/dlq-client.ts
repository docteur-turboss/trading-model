import type { HttpClient } from "@trading-model/common/config/http-client";
import type { HttpMethod } from "@trading-model/common/config/http-types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { MESSAGES_DLQ_ERROR_TOTAL } from "../../config/metrics";
import type { DlqEntry } from "./dlq-repository";
import { DlqSendHandler } from "./dlq-send-handler";
import { signedOptions } from "./request-signer";

export interface DlqSendOptions {
	attempt?: number;
	maxRetries?: number;
}

export interface IDlqServiceClient {
	readonly isEnabled: boolean;
	send(entry: DlqEntry, options?: DlqSendOptions): Promise<void>;
	replay(topic?: string, limit?: number): Promise<DlqEntry[]>;
	delete(entryIds: string[]): Promise<void>;
}

class NullDlqServiceClient implements IDlqServiceClient {
	readonly isEnabled = false;

	send(entry: DlqEntry, _options?: DlqSendOptions): Promise<void> {
		this._logNotConfigured(entry);
		return Promise.resolve();
	}

	private _logNotConfigured(entry: DlqEntry): void {
		logger.warn("DLQ Service not configured, dropping dead letter entry", {
			context: {
				reason: entry.reason,
			},
		});
		MESSAGES_DLQ_ERROR_TOTAL.inc({ target: "not-configured" });
	}

	replay(_topic?: string, _limit?: number): Promise<DlqEntry[]> {
		return Promise.resolve([]);
	}

	delete(_entryIds: string[]): Promise<void> {
		return Promise.resolve();
	}
}

export class DlqServiceClient implements IDlqServiceClient {
	private readonly _httpClient: HttpClient;
	private readonly _sendHandler: DlqSendHandler;
	private readonly _serviceUrl: string;

	constructor(httpClient: HttpClient) {
		this._httpClient = httpClient;
		this._serviceUrl = ENV.DLQ_SERVICE_URL || "";
		this._sendHandler = new DlqSendHandler(this._httpClient, this._serviceUrl);
	}

	get isEnabled(): boolean {
		return Boolean(this._serviceUrl);
	}

	async send(entry: DlqEntry, options?: DlqSendOptions): Promise<void> {
		if (!this.isEnabled) {
			return;
		}
		const attempt = options?.attempt ?? 1;
		const maxRetries = options?.maxRetries ?? 3;
		try {
			await this._sendHandler.doSend(entry);
		} catch (err) {
			return this._sendHandler.handleSendError(
				entry,
				err as Error,
				attempt,
				maxRetries
			);
		}
	}

	async replay(topic?: string, limit = 100): Promise<DlqEntry[]> {
		if (!this.isEnabled) {
			return [];
		}
		try {
			const url = this._sendHandler.buildReplayUrl(topic, limit);
			const result = await this._httpClient.get<{ entries: DlqEntry[] }>(
				url,
				signedOptions({
					method: "GET" as HttpMethod,
					path: "/dlq",
					body: undefined,
					extra: { timeoutMs: 5000 },
				})
			);
			return result?.entries ?? [];
		} catch (err) {
			logger.error("Failed to fetch DLQ entries for replay", {
				context: {
					error: normalizeError(err as Error),
				},
			});
			return [];
		}
	}

	async delete(entryIds: string[]): Promise<void> {
		if (!this.isEnabled) {
			return;
		}
		const body = { ids: entryIds };

		try {
			await this._httpClient.post(
				`${this._serviceUrl}/dlq/delete`,
				body,
				signedOptions({
					method: "POST" as HttpMethod,
					path: "/dlq/delete",
					body,
					extra: { timeoutMs: 5000 },
				})
			);
		} catch (err) {
			logger.error("Failed to delete DLQ entries", {
				context: {
					error: normalizeError(err as Error),
				},
			});
		}
	}
}

export function createDlqServiceClient(
	httpClient: HttpClient
): IDlqServiceClient {
	const url = ENV.DLQ_SERVICE_URL || "";
	if (!url) {
		return new NullDlqServiceClient();
	}
	return new DlqServiceClient(httpClient);
}
