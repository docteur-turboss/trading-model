import type { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import {
	addressManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { TokenManager } from "./token-manager";

export class HeartbeatRefresher {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _tokenManager: TokenManager,
		private readonly _identity: ServiceIdentity
	) {}

	async refresh(urls: string[]): Promise<void> {
		if (urls.length === 1) {
			await this._refreshSingleUrl(urls[0]);
		} else {
			await this._refreshMultipleUrls(urls);
		}
	}

	private _buildHeartbeatPayload(): ServiceIdentity {
		return this._identity;
	}

	private async _sendHeartbeat(url: string): Promise<void> {
		await this._httpClient.post(
			`${url}/heartbeat`,
			this._buildHeartbeatPayload(),
			{
				headers: {
					[HTTP_HEADERS.X_INSTANCE_TOKEN]: this._tokenManager.getToken(),
				},
			}
		);
	}

	private async _refreshSingleUrl(url: string): Promise<void> {
		try {
			await this._sendHeartbeat(url);
		} catch (error) {
			throw addressManagerError("Failed to refresh service TTL", {
				cause: normalizeError(error),
			});
		}
	}

	private async _refreshMultipleUrls(urls: string[]): Promise<void> {
		const results = await Promise.allSettled(
			urls.map((url) => this._sendHeartbeat(url))
		);
		const failures = results.filter((result) => result.status === "rejected");
		if (failures.length === results.length) {
			throw addressManagerError("Failed to refresh service TTL", {
				cause: normalizeError((failures[0] as PromiseRejectedResult).reason),
			});
		}
	}
}
