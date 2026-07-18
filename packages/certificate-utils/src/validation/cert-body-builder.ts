import type {
	KeyPem,
	SerialNumber,
} from "@trading-model/common/domain/primitives";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";
import { chunks } from "../format/format";
import { sign } from "../format/sign";

export interface SigningMaterial {
	certBody: string;
	privateKey: string;
	issuerCert?: string;
}

export interface CertBodyBuilderOptions {
	serialNumber: SerialNumber;
	now: Date;
	expiresAt: Date;
	publicKey: KeyPem;
	subject?: string;
	san?: string[];
	isCa?: boolean;
}

export function buildCertBodyLines(options: CertBodyBuilderOptions): string[] {
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
	return lines;
}

export class CertBodyBuilder {
	build(options: CertBodyBuilderOptions): string {
		return buildCertBodyLines(options).join("\n");
	}

	signCertBody(material: SigningMaterial): string {
		return sign({
			algorithm: CryptoAlg.SHA256,
			body: material.certBody,
			privateKey: material.privateKey as unknown as KeyPem,
		});
	}

	signAndBuildPem(material: SigningMaterial): string {
		const signature = this.signCertBody(material);
		return this.buildCertPem(material.certBody, signature, material.issuerCert);
	}

	private _buildPayload(
		certBody: string,
		signature: string,
		issuerCert?: string
	): Record<string, string> {
		const payload: Record<string, string> = { body: certBody, signature };
		if (issuerCert) {
			payload.issuerCert = issuerCert;
		}
		return payload;
	}

	buildCertPem(
		certBody: string,
		signature: string,
		issuerCert?: string
	): string {
		const payload = this._buildPayload(certBody, signature, issuerCert);
		return [
			"-----BEGIN CERTIFICATE-----",
			...chunks(Buffer.from(JSON.stringify(payload)).toString("base64"), 64),
			"-----END CERTIFICATE-----",
		].join("\n");
	}
}
