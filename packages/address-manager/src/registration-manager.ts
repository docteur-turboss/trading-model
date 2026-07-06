import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";

const MAX_REGISTRATION_RETRIES = 10;
const REGISTRATION_BASE_DELAY_MS = 1000;
const REGISTRATION_MAX_DELAY_MS = 30_000;

export class RegistrationManager {
	private _shouldRetryRegistration = true;

	constructor(
		private readonly _addressManagerClient: AddressManagerClient,
		private readonly _tokenManager: TokenManager
	) {}

	private _computeDelay(attempt: number): number {
		return Math.min(
			REGISTRATION_BASE_DELAY_MS * 2 ** attempt,
			REGISTRATION_MAX_DELAY_MS
		);
	}

	private async _attemptRegistration(attempt: number): Promise<boolean> {
		try {
			const res = await this._addressManagerClient.registerService();
			if (!res) {
				throw new Error("Registration returned no content");
			}
			this._tokenManager.setToken(res.token);
			return true;
		} catch (error) {
			logger.error("Service registration failed", {
				attempt,
				maxRetries: MAX_REGISTRATION_RETRIES,
				error: normalizeError(error),
			});
			if (attempt < MAX_REGISTRATION_RETRIES) {
				await sleep(this._computeDelay(attempt));
			}
			return false;
		}
	}

	private async _retryRegistration(): Promise<void> {
		for (let attempt = 1; attempt <= MAX_REGISTRATION_RETRIES; attempt++) {
			if (!this._shouldRetryRegistration) {
				return;
			}
			if (await this._attemptRegistration(attempt)) {
				return;
			}
		}
		logger.error("Service registration failed after max retries", {
			maxRetries: MAX_REGISTRATION_RETRIES,
		});
	}

	start(): { stop: () => void } {
		void this._retryRegistration();
		return {
			stop: () => {
				this._shouldRetryRegistration = false;
			},
		};
	}
}
