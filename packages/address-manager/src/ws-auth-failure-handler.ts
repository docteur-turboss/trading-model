import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import { REGISTRATION_TOTAL } from "./metrics";

export interface WsAuthFailureDeps {
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	wsClient?: WebSocketClient;
}

export class WsAuthFailureHandler {
	handle(deps: WsAuthFailureDeps): void {
		logger.warn("WebSocket auth failure \u2014 forcing re-registration");
		deps.addressManagerClient
			.registerService()
			.then((res) => this._handleRegistrationSuccess(res, deps))
			.catch((err) => this._handleRegistrationError(err));
	}

	private _handleRegistrationSuccess(
		res: { token?: string } | undefined,
		deps: WsAuthFailureDeps
	): void {
		if (res?.token) {
			deps.tokenManager.setToken(res.token);
			deps.wsClient?.updateToken(res.token);
			REGISTRATION_TOTAL.inc({ result: "success" });
			logger.info("Re-registered after WS auth failure");
		}
	}

	private _handleRegistrationError(err: unknown): void {
		logger.error("Re-registration after WS auth failure failed", {
			error: normalizeError(err),
		});
	}
}
