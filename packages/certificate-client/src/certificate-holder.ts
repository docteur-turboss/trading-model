import type { CertRenewScheduler } from "./cert-renew-scheduler";
import type { ObtainedCertificate } from "./certificate-client";

export class CertificateHolder {
	constructor(
		private readonly _cert: ObtainedCertificate,
		private readonly _scheduler: CertRenewScheduler
	) {}

	getCurrentCert(): ObtainedCertificate {
		return this._cert;
	}

	startAutoRenew(): void {
		this._scheduler.scheduleRenew(this._cert);
		this._scheduler.start();
	}

	stopAutoRenew(): void {
		this._scheduler.stop();
	}
}
