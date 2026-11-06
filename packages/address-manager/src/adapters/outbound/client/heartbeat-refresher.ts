import {
	addressManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { URLString } from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { TokenManager } from "../../../application/client/token-manager";

export class HeartbeatRefresher {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _tokenManager: TokenManager,
		private readonly _identity: ServiceIdentity
	) {}

	/** Never concurrent with a token rotation (TokenManager.exclusive). */
	refresh(url: URLString): Promise<void> {
		return this._tokenManager.exclusive(() => this._sendHeartbeat(url));
	}

	private async _sendHeartbeat(url: URLString): Promise<void> {
		try {
			await this._httpClient.post(
				URLString.of(`${url}/heartbeat`),
				this._identity,
				{
					headers: {
						[HTTP_HEADERS.X_INSTANCE_TOKEN]: this._tokenManager.getToken(),
					},
					idempotent: true,
				}
			);
		} catch (error) {
			throw addressManagerError("Failed to refresh service TTL", {
				cause: normalizeError(error),
			});
		}
	}
}
