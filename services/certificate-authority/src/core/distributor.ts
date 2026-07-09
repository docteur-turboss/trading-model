import type { SignedCertificate } from "@trading-model/certificate-utils/types";
import { validateCertificate } from "@trading-model/certificate-utils/validate-certificate";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import {
	toAuthToken,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";
import type { CertificateAuthority } from "./ca";

export interface DistributorOptions {
	ca: CertificateAuthority;
	certificateStore: CertificateStore;
	crlStore: CrlStore;
}

export class Distributor {
	private readonly _options: DistributorOptions;

	constructor(options: DistributorOptions) {
		this._options = options;
	}

	async getCertificate(serviceId: string): Promise<SignedCertificate | null> {
		const cert = await this._options.certificateStore.getByServiceId(serviceId);
		if (!cert) {
			return null;
		}

		const validation = validateCertificate({
			certPem: cert.certPem,
			caCertPem: this._options.ca.getCaCertPem(),
		});
		if (!validation.valid) {
			return null;
		}

		return cert;
	}

	async requestCertificate(
		serviceId: string,
		csr: string,
		_bootstrapToken?: string
	): Promise<SignedCertificate> {
		const request: CertSignRequest = {
			serviceId: toServiceId(serviceId),
			csr,
			bootstrapToken: _bootstrapToken
				? toAuthToken(_bootstrapToken)
				: undefined,
		};
		const cert = await this._options.ca.signServiceCertificate(request);
		return cert;
	}
}
