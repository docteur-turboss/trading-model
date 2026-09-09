import type { HttpClient } from "@trading-model/common/config/http-client";
import { URLString } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { authenticationError } from "@trading-model/common/utils/errors";

import type { AddressManagerConfig } from "../../../domain/config/address-manager-config";

export class TokenRefreshClient {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: AddressManagerConfig
	) {}

	private _buildAuthHeaders(token: string | null): Record<string, string> {
		const headers: Record<string, string> = {};
		if (token) {
			headers[HTTP_HEADERS.X_INSTANCE_TOKEN] = token;
		}
		return headers;
	}

	private _buildTokenPayload(): ServiceIdentity {
		return {
			instanceId: this._config.identity.instanceId,
			serviceName: this._config.identity.serviceName,
		};
	}

	async doRefresh(currentToken: string | null): Promise<string> {
		const response = await this._httpClient.post<{ token: string }>(
			URLString.of(`${this._config.addressManagerUrl}/token/rotate`),
			this._buildTokenPayload(),
			{ headers: this._buildAuthHeaders(currentToken) }
		);
		if (!response?.token) {
			throw authenticationError("Invalid token response from Address Manager");
		}
		return response.token;
	}
}
