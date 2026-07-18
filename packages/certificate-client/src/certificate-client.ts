import type { KeyAlgorithm } from "@trading-model/certificate-utils/keygen/generate-key-pair";
import {
	type ServiceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { CaClient } from "@trading-model/crypto/ca/ca-client";
import type { CertificateHolder } from "./certificate-holder";
import {
	CertificateLifecycleOrchestrator,
	type LifecycleDeps,
	type ObtainedCertificate,
} from "./certificate-lifecycle-orchestrator";
import { CertificateSigner } from "./certificate-signer";
import { DiskCertificateStore } from "./certificate-store";
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

export type { ObtainedCertificate };

export class CertificateClient {
	public readonly caClient: CaClient;
	public readonly orchestrator: CertificateLifecycleOrchestrator;

	constructor(config: CertificateClientConfig) {
		this.caClient = new CaClient({
			baseUrl: URLString.of(config.caUrl),
			tls: config.tls,
		});
		const keyGenerator = new KeyGenerator(config);
		const signer = new CertificateSigner(config, this.caClient);
		const store = new DiskCertificateStore(config);
		this.orchestrator = new CertificateLifecycleOrchestrator({
			keyGenerator,
			signer,
			store,
			config: {
				serviceId: config.serviceId,
				onRenew: config.onRenew,
				renewMarginMs: config.renewMarginMs,
			},
		} satisfies LifecycleDeps);
	}

	static createObtained(
		config: CertificateClientConfig
	): Promise<CertificateHolder> {
		const client = new CertificateClient(config);
		return client.orchestrator.obtainCertificate();
	}
}
