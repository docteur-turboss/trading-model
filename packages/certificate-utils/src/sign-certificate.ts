import { createHash, createPublicKey, randomUUID } from "node:crypto";

import {
	type ServiceId,
	toFingerprint,
	toSerialNumber,
} from "@trading-model/common/domain/primitives";
import { CertBodyBuilder, type CertBodyBuilderOptions } from "./cert-body-builder";
import type { KeyPair, SignedCertificate } from "./types";

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

function _exportPublicKeyPem(
	publicKey: ReturnType<typeof createPublicKey>
): string {
	return publicKey.export({ type: "spki", format: "pem" });
}

function _parseCsrBody(csr: string): string {
	const lines = csr
		.split("\n")
		.filter(
			(line) => !(line.startsWith("-----BEGIN") || line.startsWith("-----END"))
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

function _buildCertificateOptions(params: {
	serialNumber: string;
	now: Date;
	expiresAt: Date;
	publicKeyPem: string;
	commonName: string;
	san: string[];
}): CertBodyBuilderOptions {
	return {
		serialNumber: toSerialNumber(params.serialNumber),
		now: params.now,
		expiresAt: params.expiresAt,
		publicKey: params.publicKeyPem,
		subject: params.commonName,
		san: params.san,
	};
}

export function signCertificate(options: SignOptions): SignedCertificate {
	const { csr, serviceId, caKeyPair, caCertPem, ttlMs } = options;
	const csrData = parseCsr(csr);
	const serialNumber = _buildSerialNumber();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ttlMs);
	const publicKeyPem = _exportPublicKeyPem(createPublicKey(csrData.publicKey));

	const builder = new CertBodyBuilder();
	const certBody = builder.build(
		_buildCertificateOptions({
			serialNumber,
			now,
			expiresAt,
			publicKeyPem,
			commonName: csrData.commonName,
			san: csrData.san,
		})
	);
	const signature = builder.signCertBody(certBody, caKeyPair.privateKey);
	const certPem = builder.buildCertPem(certBody, signature, caCertPem);
	const fingerprint = createHash("sha256").update(certPem).digest("hex");

	return {
		serialNumber: toSerialNumber(serialNumber),
		certPem,
		caPem: caCertPem,
		serviceId,
		issuedAt: now,
		expiresAt,
		fingerprint: toFingerprint(fingerprint),
	};
}
