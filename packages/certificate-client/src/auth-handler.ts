import { logger } from "@trading-model/common/config/logger";

export class AuthHandler {
	private _wsAuthSent = false;

	get isAuthSent(): boolean {
		return this._wsAuthSent;
	}

	reset(): void {
		this._wsAuthSent = false;
	}

	handleResponse(msg: Record<string, unknown>, onRejected: () => void): void {
		if (msg.success) {
			this._wsAuthSent = true;
			logger.info("WSS auth token delivered to CA");
		} else {
			logger.error("WSS auth message rejected by CA", {
				error: (msg.error as { message?: string })?.message,
			});
			onRejected();
		}
	}
}
