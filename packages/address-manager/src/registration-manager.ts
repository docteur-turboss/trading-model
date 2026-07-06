import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import type { AddressManagerDeps } from "./types";

const MAX_REGISTRATION_RETRIES = 10;
const REGISTRATION_BASE_DELAY_MS = 1000;
const REGISTRATION_MAX_DELAY_MS = 30_000;

export class RegistrationManager {
	shouldRetryRegistration = true;

	constructor(private readonly _deps: AddressManagerDeps) {}

	private _computeDelay(attempt: number): number {
		return Math.min(
			REGISTRATION_BASE_DELAY_MS * 2 ** attempt,
			REGISTRATION_MAX_DELAY_MS
		);
	}

	private async _attemptRegistration(attempt: number): Promise<boolean> {
		try {
			const res = await this._deps.addressManagerClient.registerService();
			if (!res) {
				throw new Error("Registration returned no content");
			}
			this._deps.tokenManager.setToken(res.token);
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
			if (!this.shouldRetryRegistration) {
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

	async tryStickyRegistration(): Promise<void> {
		await this._retryRegistration();
	}

	start(): { stop: () => void } {
		void this._retryRegistration();
		return {
			stop: () => {
				this.shouldRetryRegistration = false;
			},
		};
	}
}
