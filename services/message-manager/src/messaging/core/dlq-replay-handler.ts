import type { HttpClient } from "@trading-model/common/config/http-client";
import type { Limit, Topic } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { HttpMethod } from "@trading-model/validation/contracts/signed-request";
import { logger } from "../../config/logger";
import type { DlqEntry } from "./dlq-repository";
import { signedOptions } from "./request-signer";

export class DlqReplayHandler {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _serviceUrl: string
	) {}

	async replay(topic?: Topic, limit?: Limit): Promise<DlqEntry[]> {
		try {
			return await this._doReplay(topic, limit);
		} catch (err) {
			return this._logReplayError(err as Error);
		}
	}

	private async _doReplay(topic?: Topic, limit?: Limit): Promise<DlqEntry[]> {
		const url = this._buildReplayUrl(topic, limit);
		const result = await this._httpClient.get<{ entries: DlqEntry[] }>(
			url,
			signedOptions({
				method: HttpMethod.Get,
				path: "/dlq",
				body: undefined,
				extra: { timeoutMs: 5000 },
			})
		);
		return result?.entries ?? [];
	}

	private _buildReplayUrl(topic?: Topic, limit?: Limit): string {
		const params = new URLSearchParams();
		if (topic) {
			params.set("topic", topic);
		}
		params.set("limit", String(limit ?? 100));
		return `${this._serviceUrl}/dlq?${params.toString()}`;
	}

	private _logReplayError(err: Error): DlqEntry[] {
		logger.error("Failed to fetch DLQ entries for replay", {
			context: {
				error: normalizeError(err),
			},
		});
		return [];
	}
}
