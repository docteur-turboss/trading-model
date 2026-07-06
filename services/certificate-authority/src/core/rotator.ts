import { logger } from "@trading-model/common/config/logger";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CertificateAuthority } from "./ca";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export interface RotatorOptions {
	ca: CertificateAuthority;
	certificateStore: CertificateStore;
	intervalMs: number;
	marginMs: number;
	defaultTtlMs: number;
}

export class Rotator {
	private readonly _options: RotatorOptions;
	private readonly _timer = new TimerHandle();

	constructor(options: RotatorOptions) {
		this._options = options;
	}

	private _logRotatorStart(): void {
		logger.info("Starting certificate rotator", {
			context: { intervalMs: this._options.intervalMs, marginMs: this._options.marginMs },
		});
	}

	private _scheduleRotation(): void {
		this._timer.startInterval(() => {
			this._rotate().catch((err) => {
				logger.error("Certificate rotation failed", { context: { err } });
			});
		}, this._options.intervalMs);
	}

	start(): void {
		if (this._timer.isRunning) {
			return;
		}
		this._logRotatorStart();
		this._scheduleRotation();
	}

	stop(): void {
		this._timer.stop();
		logger.info("Certificate rotator stopped");
	}

	private _rotateSingleCert(cert: { serviceId: string; serialNumber: string; expiresAt: Date }): void {
		logger.info("Rotating certificate", {
			context: { serviceId: cert.serviceId, serialNumber: cert.serialNumber, expiresAt: cert.expiresAt },
		});
	}

	private async _rotate(): Promise<void> {
		const expiringCerts = await this._options.certificateStore.getExpiring(this._options.marginMs);
		if (expiringCerts.length === 0) {
			return;
		}
		logger.info("Rotating expiring certificates", { context: { count: expiringCerts.length } });
		for (const cert of expiringCerts) {
			try {
				this._rotateSingleCert(cert);
			} catch (err) {
				logger.error("Failed to rotate certificate", {
					context: { serviceId: cert.serviceId, serialNumber: cert.serialNumber, err },
				});
			}
		}
	}
}
