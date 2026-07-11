import { logger } from "@trading-model/common/config/logger";
import type { CertificateBase } from "@trading-model/common/domain/certificate-base";
import type { KeyPem } from "@trading-model/common/domain/primitives";
import { CertRenewScheduler } from "./cert-renew-scheduler";
import type { CertificateEventEmitter } from "./certificate-event-emitter";
import { CertificateHolder } from "./certificate-holder";
import type { CertificateSigner } from "./certificate-signer";
import type { CertificateStore } from "./certificate-store";
import type { KeyGenerator } from "./key-generator";

export interface ObtainedCertificate extends CertificateBase {
	keyPem: KeyPem;
}

export interface LifecycleConfig {
	serviceId: import("@trading-model/common/domain/primitives").ServiceId;
	onRenew?: (cert: ObtainedCertificate) => void;
	renewMarginMs?: number;
}

export class CertificateLifecycleOrchestrator {
	constructor(
		private readonly _keyGenerator: KeyGenerator,
		private readonly _signer: CertificateSigner,
		private readonly _store: CertificateStore,
		private readonly _eventEmitter: CertificateEventEmitter,
		private readonly _config: LifecycleConfig
	) {}

	private _logCertObtained(response: {
		serialNumber: string;
		expiresAt: string;
	}): void {
		logger.info("Certificate obtained", {
			serviceId: this._config.serviceId,
			serialNumber: response.serialNumber,
			expiresAt: response.expiresAt,
		});
	}

	private _createRenewScheduler(): CertRenewScheduler {
		return new CertRenewScheduler(
			this._config.serviceId,
			this._config.renewMarginMs ?? 86400000,
			() => this.obtainCertificate().then(() => {})
		);
	}

	async obtainCertificate(): Promise<CertificateHolder> {
		const { keyPair, csr } = await this._keyGenerator.generateKeyAndCsr();
		const response = await this._signer.signWithCa(csr);
		await this._store.writeCertificates(keyPair, response);
		const cert = this._store.buildObtainedCert(
			keyPair,
			response
		) as ObtainedCertificate;
		this._logCertObtained(response);
		this._eventEmitter.notifyOnRenew(this._config.onRenew, cert);
		const scheduler = this._createRenewScheduler();
		return new CertificateHolder(cert, scheduler);
	}
}
