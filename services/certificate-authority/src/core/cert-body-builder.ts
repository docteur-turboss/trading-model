import { createSign } from "node:crypto";

import type { CertBodyInput } from "./ca";

export class CertBodyBuilder {
	buildCertBody({
		serialNumber,
		now,
		expiresAt,
		publicKey,
	}: CertBodyInput): string {
		return [
			`Serial: ${serialNumber}`,
			"Issuer: CN=TradingModelCA",
			"Subject: CN=TradingModelCA",
			`Not Before: ${now.toISOString()}`,
			`Not After: ${expiresAt.toISOString()}`,
			"CA: TRUE",
			`Public Key: ${publicKey}`,
		].join("\n");
	}

	createCertBody(certBody: string, signature: string): string {
		return [
			"-----BEGIN CERTIFICATE-----",
			...chunks(
				Buffer.from(JSON.stringify({ body: certBody, signature })).toString(
					"base64",
				),
				64,
			),
			"-----END CERTIFICATE-----",
		].join("\n");
	}

	signCertBody(certBody: string, privateKey: string): string {
		const sign = createSign("sha256");
		sign.update(certBody);
		const signature = sign.sign(privateKey, "base64");
		return this.createCertBody(certBody, signature);
	}
}

function chunks(str: string, size: number): string[] {
	const result: string[] = [];
	for (let i = 0; i < str.length; i += size) {
		result.push(str.slice(i, i + size));
	}
	return result;
}
