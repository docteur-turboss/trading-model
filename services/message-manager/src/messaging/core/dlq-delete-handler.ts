import type { HttpClient } from "@trading-model/common/config/http-client";
import { normalizeError } from "@trading-model/common/utils/errors";
import { HttpMethod } from "@trading-model/validation/contracts/signed-request";
import { logger } from "../../config/logger";
import { signedOptions } from "./request-signer";

export class DlqDeleteHandler {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _serviceUrl: string
	) {}

	async delete(entryIds: string[]): Promise<void> {
		try {
			await this._doDelete(entryIds);
		} catch (err) {
			this._logDeleteError(err as Error);
		}
	}

	private async _doDelete(entryIds: string[]): Promise<void> {
		const body = { ids: entryIds };
		await this._httpClient.post(
			`${this._serviceUrl}/dlq/delete`,
			body,
			signedOptions({
				method: HttpMethod.Post,
				path: "/dlq/delete",
				body,
				extra: { timeoutMs: 5000 },
			})
		);
	}

	private _logDeleteError(err: Error): void {
		logger.error("Failed to delete DLQ entries", {
			context: {
				error: normalizeError(err),
			},
		});
	}
}
