import { createSign } from "node:crypto";

import type { SerialNumber } from "@trading-model/common/domain/primitives";

export interface CertBodyBuilderOptions {
	serialNumber: SerialNumber;
	now: Date;
	expiresAt: Date;
	publicKey: string;
	subject?: string;
	san?: string[];
	isCa?: boolean;
}

export class CertBodyBuilder {
	buildCertBody(options: CertBodyBuilderOptions): string {
		const { serialNumber, now, expiresAt, publicKey, subject, san, isCa } =
			options;
		const lines = [
			`Serial: ${serialNumber}`,
			"Issuer: CN=TradingModelCA",
			`Subject: CN=${subject ?? "TradingModelCA"}`,
			`Not Before: ${now.toISOString()}`,
			`Not After: ${expiresAt.toISOString()}`,
		];
		if (san && san.length > 0) {
			lines.push(`SAN: ${san.join(", ")}`);
		}
		if (isCa) {
			lines.push("CA: TRUE");
		}
		lines.push(`Public Key: ${publicKey}`);
		return lines.join("\n");
	}

	signCertBody(certBody: string, privateKey: string): string {
		const sign = createSign("sha256");
		sign.update(certBody);
		return sign.sign(privateKey, "base64");
	}

	signAndBuildPem(
		certBody: string,
		privateKey: string,
		issuerCert?: string
	): string {
		const signature = this.signCertBody(certBody, privateKey);
		return this.buildCertPem(certBody, signature, issuerCert);
	}

	buildCertPem(
		certBody: string,
		signature: string,
		issuerCert?: string
	): string {
		const payload: Record<string, string> = { body: certBody, signature };
		if (issuerCert) {
			payload.issuerCert = issuerCert;
		}
		return [
			"-----BEGIN CERTIFICATE-----",
			...chunks(Buffer.from(JSON.stringify(payload)).toString("base64"), 64),
			"-----END CERTIFICATE-----",
		].join("\n");
	}
}

function chunks(str: string, size: number): string[] {
	const result: string[] = [];
	for (let i = 0; i < str.length; i += size) {
		result.push(str.slice(i, i + size));
	}
	return result;
}
