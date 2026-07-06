import {
	createHash,
	createPublicKey,
	createSign,
	randomUUID,
} from "node:crypto";

import type { KeyPair, SignedCertificate } from "./types";

export interface SignOptions {
	csr: string;
	serviceId: string;
	caKeyPair: KeyPair;
	caCertPem: string;
	ttlMs: number;
}

function _buildSerialNumber(): string {
	return randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase();
}

function _buildCertBody(options: {
	serialNumber: string;
	csrData: ReturnType<typeof parseCsr>;
	publicKey: ReturnType<typeof createPublicKey>;
	now: Date;
	expiresAt: Date;
}): string {
	const { serialNumber, csrData, publicKey, now, expiresAt } = options;
	return [
		`Serial: ${serialNumber}`,
		"Issuer: CN=TradingModelCA",
		`Subject: CN=${csrData.commonName}`,
		`Not Before: ${now.toISOString()}`,
		`Not After: ${expiresAt.toISOString()}`,
		`SAN: ${csrData.san.join(", ")}`,
		`Public Key: ${_exportPublicKeyPem(publicKey)}`,
	].join("\n");
}

function _exportPublicKeyPem(publicKey: ReturnType<typeof createPublicKey>): string {
	return publicKey.export({ type: "spki", format: "pem" });
}

function _signCertBody(certBody: string, privateKey: string): string {
	const sign = createSign("sha256");
	sign.update(certBody);
	return sign.sign(privateKey, "base64");
}

function _buildCertPem(
	certBody: string,
	signature: string,
	caCertPem: string
): string {
	return [
		"-----BEGIN CERTIFICATE-----",
		...chunks(
			Buffer.from(
				JSON.stringify({ body: certBody, signature, issuerCert: caCertPem })
			).toString("base64"),
			64
		),
		"-----END CERTIFICATE-----",
	].join("\n");
}

export function signCertificate(options: SignOptions): SignedCertificate {
	const { csr, serviceId, caKeyPair, caCertPem, ttlMs } = options;

	const csrData = parseCsr(csr);
	const publicKey = createPublicKey(csrData.publicKey);

	const serialNumber = _buildSerialNumber();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlMs);

	const certBody = _buildCertBody({ serialNumber, csrData, publicKey, now, expiresAt });
	const signature = _signCertBody(certBody, caKeyPair.privateKey);
	const certPem = _buildCertPem(certBody, signature, caCertPem);

	const fingerprint = createHash("sha256").update(certPem).digest("hex");

	return {
		serialNumber,
		certPem,
		caPem: caCertPem,
		serviceId,
		issuedAt: now,
		expiresAt,
		fingerprint,
	};
}

function parseCsr(csr: string): {
	commonName: string;
	san: string[];
	publicKey: string;
} {
	const lines = csr
		.split("\n")
		.filter(
			(line) => !(line.startsWith("-----BEGIN") || line.startsWith("-----END"))
		);
	const body = Buffer.from(lines.join(""), "base64").toString("utf8");
	return JSON.parse(body);
}

function chunks(str: string, size: number): string[] {
	const result: string[] = [];
	for (let i = 0; i < str.length; i += size) {
		result.push(str.slice(i, i + size));
	}
	return result;
}
