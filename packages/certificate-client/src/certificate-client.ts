import { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import type { CertificateBase } from "@trading-model/common/domain/certificate-base";
import { CaClient, type SignCertificateRequest } from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { CertRenewScheduler } from "./cert-renew-scheduler";
import { CertificateLifecycle } from "./certificate-lifecycle";

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
	private readonly _lifecycle: CertificateLifecycle;
	private _obtainedCert: ObtainedCertificate | null;
	private _renewScheduler: CertRenewScheduler;

	constructor(config: CertificateClientConfig, initialCert?: ObtainedCertificate) {
		this._config = config;
		this._obtainedCert = initialCert ?? null;
		this._caClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
		this._lifecycle = new CertificateLifecycle(config, this._caClient);
		this._renewScheduler = new CertRenewScheduler(
			config.serviceId,
			config.renewMarginMs ?? 86400000,
			() => this.obtainCertificate().then(() => {}),
		);
	}

	private get _requiredCert(): ObtainedCertificate {
		if (!this._obtainedCert) throw new Error("Certificate not yet obtained");
		return this._obtainedCert;
	}

	static async createObtained(config: CertificateClientConfig): Promise<CertificateClient> {
		const client = new CertificateClient(config);
		await client.obtainCertificate();
		return client;
	}

	async obtainCertificate(): Promise<ObtainedCertificate> {
		const { keyPair, csr } = await this._lifecycle.generateKeyAndCsr();
		const response = await this._lifecycle.signWithCa(csr);
		await this._lifecycle.writeCertificates(keyPair, response);
		this._obtainedCert = this._lifecycle.buildObtainedCert(keyPair, response);
		logger.info("Certificate obtained", {
			serviceId: this._config.serviceId,
			serialNumber: response.serialNumber,
			expiresAt: response.expiresAt,
		});
		this._lifecycle.notifyOnRenew(this._config.onRenew, this._requiredCert);
		return this._requiredCert;
	}

	async signCertificate(request: SignCertificateRequest): Promise<import("@trading-model/common/ca/ca-client").SignCertificateResponse> {
		return this._caClient.signCertificate(request);
	}

	async getCertificate(serviceId: ServiceId): Promise<import("@trading-model/common/ca/ca-client").GetCertificateResponse | null> {
		return this._caClient.getCertificate(serviceId);
	}

	startAutoRenew(): void {
		if (this._obtainedCert) {
			this._renewScheduler.scheduleRenew(this._obtainedCert);
		}
		this._renewScheduler.start();
	}

	stopAutoRenew(): void {
		this._renewScheduler.stop();
	}

	getCurrentCert(): ObtainedCertificate | null {
		return this._obtainedCert;
	}
}
