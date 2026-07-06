import {
	createHash,
	createPublicKey,
	randomUUID,
} from "node:crypto";

import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { KeyPair, SignedCertificate } from "./types";
import { CertBodyBuilder } from "./cert-body-builder";

export interface SignOptions {
	csr: string;
	serviceId: ServiceId;
	caKeyPair: KeyPair;
	caCertPem: string;
	ttlMs: number;
}

function _buildSerialNumber(): string {
	return randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase();
}

function _exportPublicKeyPem(publicKey: ReturnType<typeof createPublicKey>): string {
	return publicKey.export({ type: "spki", format: "pem" });
}

function _parseCsrBody(csr: string): string {
	const lines = csr
		.split("\n")
		.filter(
			(line) => !(line.startsWith("-----BEGIN") || line.startsWith("-----END")),
		);
	return Buffer.from(lines.join(""), "base64").toString("utf8");
}

function parseCsr(csr: string): {
	commonName: string;
	san: string[];
	publicKey: string;
} {
	return JSON.parse(_parseCsrBody(csr));
}

export function signCertificate(options: SignOptions): SignedCertificate {
	const { csr, serviceId, caKeyPair, caCertPem, ttlMs } = options;
	const csrData = parseCsr(csr);
	const serialNumber = _buildSerialNumber();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlMs);
	const publicKeyPem = _exportPublicKeyPem(createPublicKey(csrData.publicKey));

	const builder = new CertBodyBuilder();
	const certBody = builder.buildCertBody({
		serialNumber,
		now,
		expiresAt,
		publicKey: publicKeyPem,
		subject: csrData.commonName,
		san: csrData.san,
	});
	const signature = builder.signCertBody(certBody, caKeyPair.privateKey);
	const certPem = builder.buildCertPem(certBody, signature, caCertPem);
	const fingerprint = createHash("sha256").update(certPem).digest("hex");

	return { serialNumber, certPem, caPem: caCertPem, serviceId, issuedAt: now, expiresAt, fingerprint };
}


