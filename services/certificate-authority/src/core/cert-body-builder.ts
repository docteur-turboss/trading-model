import { CertBodyBuilder as CommonCertBodyBuilder } from "@trading-model/certificate-utils/cert-body-builder";

import type { CertBodyInput } from "./ca";

export class CertBodyBuilder extends CommonCertBodyBuilder {
	buildCertBody({
		serialNumber,
		now,
		expiresAt,
		publicKey,
	}: CertBodyInput): string {
		return super.buildCertBody({
			serialNumber,
			now,
			expiresAt,
			publicKey,
			isCa: true,
		});
	}

	signCertBody(certBody: string, privateKey: string): string {
		const signature = super.signCertBody(certBody, privateKey);
		return this.buildCertPem(certBody, signature);
	}
}
