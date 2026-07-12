import {
	type ServiceId,
	toAuthToken,
	toCsrPem,
} from "@trading-model/common/domain/primitives";
import type {
	CaClient,
	SignCertificateRequest,
} from "@trading-model/crypto/ca/ca-client";

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
			csr: toCsrPem(csr),
			bootstrapToken: this._config.bootstrapToken
				? toAuthToken(this._config.bootstrapToken)
				: undefined,
		};
		return await this._caClient.signCertificate(request);
	}
}
