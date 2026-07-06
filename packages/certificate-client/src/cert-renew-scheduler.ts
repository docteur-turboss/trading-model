import { logger } from "@trading-model/common/config/logger";
import type { ObtainedCertificate } from "./certificate-client";

export class CertRenewScheduler {
	private _renewTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly _serviceId: string,
		private readonly _renewMarginMs: number,
		private readonly _onRenew: () => Promise<void>,
	) {}

	start(): void {
		if (this._renewTimer) {
			return;
		}
		void this._schedule();
	}

	stop(): void {
		if (this._renewTimer) {
			clearTimeout(this._renewTimer);
			this._renewTimer = null;
		}
	}

	private async _schedule(): Promise<void> {
		const delay = this._renewMarginMs;
		this._setupTimer(delay);
	}

	private _setupTimer(delay: number): void {
		this._renewTimer = setTimeout(() => {
			this._onRenew()
				.then(() => this._schedule())
				.catch((err: Error) => {
					logger.error("Certificate renewal failed, retrying", { err });
					this._renewTimer = setTimeout(
						() => this._schedule(),
						60000,
					);
				});
		}, delay);
	}

	scheduleRenew(cert: ObtainedCertificate): void {
		const expiresAt = cert.expiresAt.getTime();
		const remaining = expiresAt - Date.now();

		if (remaining <= this._renewMarginMs) {
			this._handleExpired();
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
