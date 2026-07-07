import { CertBodyBuilder as CommonCertBodyBuilder } from "@trading-model/certificate-utils/cert-body-builder";

import type { CertBodyInput } from "./ca";

export class CertBodyBuilder extends CommonCertBodyBuilder {
	build({
		serialNumber,
		now,
		expiresAt,
		publicKey,
	}: CertBodyInput): string {
		return super.build({
			serialNumber,
			now,
			expiresAt,
			publicKey,
			isCa: true,
		});
	}
}
