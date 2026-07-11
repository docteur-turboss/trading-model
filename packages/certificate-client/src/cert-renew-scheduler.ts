import { logger } from "@trading-model/common/config/logger";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { ObtainedCertificate } from "./certificate-client";

export class CertRenewScheduler {
	private readonly _renewTimer = new TimerHandle();

	constructor(
		private readonly _serviceId: string,
		private readonly _renewMarginMs: number,
		private readonly _onRenew: () => Promise<void>
	) {}

	start(): void {
		if (this._renewTimer.isRunning) {
			return;
		}
		void this._schedule();
	}

	stop(): void {
		this._renewTimer.stop();
	}

	private _schedule(): void {
		this._setupTimer(this._renewMarginMs);
	}

	private _setupTimer(delay: number): void {
		this._renewTimer.startTimeout(() => {
			this._onRenew()
				.then(() => this._schedule())
				.catch((err: Error) => {
					logger.error("Certificate renewal failed, retrying", { err });
					this._renewTimer.startTimeout(() => this._schedule(), 60000);
				});
		}, delay);
	}

	async scheduleRenew(cert: ObtainedCertificate): Promise<void> {
		const remaining = cert.expiresAt - Date.now();
		if (remaining <= this._renewMarginMs) {
			await this._handleExpired();
			return;
		}
		const delay = remaining - this._renewMarginMs;
		this._setupTimer(delay);
		this._logScheduled(delay, cert);
	}

	private async _handleExpired(): Promise<void> {
		try {
			await this._onRenew();
		} catch (err) {
			logger.error("Certificate renewal failed", { err });
		}
		this._schedule();
	}

	private _logScheduled(delay: number, cert: ObtainedCertificate): void {
		logger.info("Certificate renewal scheduled", {
			serviceId: this._serviceId,
			delay,
			expiresAt: cert.expiresAt,
		});
	}
}
