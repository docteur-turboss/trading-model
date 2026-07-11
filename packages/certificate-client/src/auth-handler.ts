import { logger } from "@trading-model/common/config/logger";

export enum CaWssMessageType {
	AuthResponse = "auth:response",
	SignResponse = "sign:response",
	Response = "response",
}

export interface CaAuthResponse {
	type: CaWssMessageType.AuthResponse;
	success: boolean;
	error?: { message?: string };
}

export class AuthHandler {
	private _wsAuthSent = false;

	get isAuthSent(): boolean {
		return this._wsAuthSent;
	}

	reset(): void {
		this._wsAuthSent = false;
	}

	handleResponse(msg: CaAuthResponse, onRejected: () => void): void {
		if (msg.success) {
			this._wsAuthSent = true;
			logger.info("WSS auth token delivered to CA");
		} else {
			logger.error("WSS auth message rejected by CA", {
				error: msg.error?.message,
			});
			onRejected();
		}
	}
}
