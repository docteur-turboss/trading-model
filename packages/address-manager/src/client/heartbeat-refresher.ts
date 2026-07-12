import type { HttpClient } from "@trading-model/common/config/http-client";
import { URLString } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import {
	addressManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { TokenManager } from "./token-manager";

function isRejected<TValue>(
	result: PromiseSettledResult<TValue>
): result is PromiseRejectedResult {
	return result.status === "rejected";
}

export class HeartbeatRefresher {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _tokenManager: TokenManager,
		private readonly _identity: ServiceIdentity
	) {}

	async refresh(urls: URLString[]): Promise<void> {
		if (urls.length === 1) {
			await this._refreshSingleUrl(urls[0]);
		} else {
			await this._refreshMultipleUrls(urls);
		}
	}

	private _buildHeartbeatPayload(): ServiceIdentity {
		return this._identity;
	}

	private async _sendHeartbeat(url: URLString): Promise<void> {
		await this._httpClient.post(
			URLString.of(`${url}/heartbeat`),
			this._buildHeartbeatPayload(),
			{
				headers: {
					[HTTP_HEADERS.X_INSTANCE_TOKEN]: this._tokenManager.getToken(),
				},
			}
		);
	}

	private async _refreshSingleUrl(url: URLString): Promise<void> {
		try {
			await this._sendHeartbeat(url);
		} catch (error) {
			throw addressManagerError("Failed to refresh service TTL", {
				cause: normalizeError(error),
			});
		}
	}

	private async _refreshMultipleUrls(urls: URLString[]): Promise<void> {
		const results = await Promise.allSettled(
			urls.map((url) => this._sendHeartbeat(url))
		);
		const failures = results.filter(isRejected);
		if (failures.length === results.length) {
			throw addressManagerError("Failed to refresh service TTL", {
				cause: normalizeError((failures[0] as PromiseRejectedResult).reason),
			});
		}
	}
}
