import type { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import {
	CaClient,
	type SignCertificateRequest,
} from "@trading-model/common/ca/ca-client";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { CertificateEventEmitter } from "./certificate-event-emitter";
import type { CertificateHolder } from "./certificate-holder";
import {
	CertificateLifecycleOrchestrator,
	type ObtainedCertificate,
} from "./certificate-lifecycle-orchestrator";
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

export type { ObtainedCertificate };

export class CertificateClient {
	private readonly _caClient: CaClient;
	private readonly _orchestrator: CertificateLifecycleOrchestrator;

	constructor(config: CertificateClientConfig) {
		this._caClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
		const keyGenerator = new KeyGenerator(config);
		const signer = new CertificateSigner(config, this._caClient);
		const store = new CertificateStore(config);
		const eventEmitter = new CertificateEventEmitter();
		this._orchestrator = new CertificateLifecycleOrchestrator(
			keyGenerator,
			signer,
			store,
			eventEmitter,
			{
				serviceId: config.serviceId,
				onRenew: config.onRenew,
				renewMarginMs: config.renewMarginMs,
			}
		);
	}

	static createObtained(
		config: CertificateClientConfig
	): Promise<CertificateHolder> {
		const client = new CertificateClient(config);
		return client.obtainCertificate();
	}

	obtainCertificate(): Promise<CertificateHolder> {
		return this._orchestrator.obtainCertificate();
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
