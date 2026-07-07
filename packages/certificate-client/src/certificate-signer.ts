import type {
	CaClient,
	SignCertificateRequest,
} from "@trading-model/common/ca/ca-client";
import type { ServiceId } from "@trading-model/common/domain/primitives";

export interface SignerConfig {
	serviceId: ServiceId;
	bootstrapToken?: string;
}

export class CertificateSigner {
	constructor(
		private readonly _config: SignerConfig,
		private readonly _caClient: CaClient
	) {}

	async signWithCa(csr: string) {
		const request: SignCertificateRequest = {
			serviceId: this._config.serviceId,
			csr,
			bootstrapToken: this._config.bootstrapToken,
		};
		return await this._caClient.signCertificate(request);
	}
}
