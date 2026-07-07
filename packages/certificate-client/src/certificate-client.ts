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
import { CertificateHolder } from "./certificate-holder";
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

	constructor(config: CertificateClientConfig) {
		this._config = config;
		this._caClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
		this._lifecycle = new CertificateLifecycle(config, this._caClient);
	}

	static createObtained(
		config: CertificateClientConfig
	): Promise<CertificateHolder> {
		const client = new CertificateClient(config);
		return client.obtainCertificate();
	}

	async obtainCertificate(): Promise<CertificateHolder> {
		const { keyPair, csr } = await this._lifecycle.generateKeyAndCsr();
		const response = await this._lifecycle.signWithCa(csr);
		await this._lifecycle.writeCertificates(keyPair, response);
		const cert = this._lifecycle.buildObtainedCert(keyPair, response);
		logger.info("Certificate obtained", {
			serviceId: this._config.serviceId,
			serialNumber: response.serialNumber,
			expiresAt: response.expiresAt,
		});
		this._lifecycle.notifyOnRenew(this._config.onRenew, cert);

		const scheduler = new CertRenewScheduler(
			this._config.serviceId,
			this._config.renewMarginMs ?? 86400000,
			() => this.obtainCertificate().then(() => {})
		);

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
