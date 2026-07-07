import type { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import {
	CaClient,
	type SignCertificateRequest,
} from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import type { CertificateBase } from "@trading-model/common/domain/certificate-base";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { CertRenewScheduler } from "./cert-renew-scheduler";
import { CertificateEventEmitter } from "./certificate-event-emitter";
import { CertificateHolder } from "./certificate-holder";
import { CertificateSigner } from "./certificate-signer";
import { CertificateStore } from "./certificate-store";
import { KeyGenerator } from "./key-generator";

export interface CertificateClientConfig {
	caUrl: string;
	serviceId: ServiceId;
	commonName: string;
	san: string[];
	tlsPaths: TlsPaths;
	bootstrapToken?: string;
	keyAlgorithm?: KeyAlgorithm;
	renewMarginMs?: number;
	tls?: TlsPaths;
	onRenew?: (cert: ObtainedCertificate) => void;
}

export interface ObtainedCertificate extends CertificateBase {
	keyPem: string;
}

export class CertificateClient {
	private readonly _config: CertificateClientConfig;
	private readonly _caClient: CaClient;
	private readonly _keyGenerator: KeyGenerator;
	private readonly _signer: CertificateSigner;
	private readonly _store: CertificateStore;
	private readonly _eventEmitter: CertificateEventEmitter;

	constructor(config: CertificateClientConfig) {
		this._config = config;
		this._caClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
		this._keyGenerator = new KeyGenerator(config);
		this._signer = new CertificateSigner(config, this._caClient);
		this._store = new CertificateStore(config);
		this._eventEmitter = new CertificateEventEmitter();
	}

	static createObtained(
		config: CertificateClientConfig
	): Promise<CertificateHolder> {
		const client = new CertificateClient(config);
		return client.obtainCertificate();
	}

	private _logCertObtained(response: { serialNumber: string; expiresAt: string }): void {
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
		const cert = this._store.buildObtainedCert(keyPair, response);
		this._logCertObtained(response);
		this._eventEmitter.notifyOnRenew(this._config.onRenew, cert);
		const scheduler = this._createRenewScheduler();
		return new CertificateHolder(cert, scheduler);
	}

	signCertificate(
		request: SignCertificateRequest
	): Promise<
		import("@trading-model/common/ca/ca-client").SignCertificateResponse
	> {
		return this._caClient.signCertificate(request);
	}

	getCertificate(
		serviceId: ServiceId
	): Promise<
		import("@trading-model/common/ca/ca-client").GetCertificateResponse | null
	> {
		return this._caClient.getCertificate(serviceId);
	}
}
