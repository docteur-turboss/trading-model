import { createHash, createPublicKey, randomUUID } from "node:crypto";

import { CRYPTO } from "@trading-model/common/crypto/crypto-constants";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import {
	toFingerprint,
	toSerialNumber,
} from "@trading-model/common/domain/primitives";
import type { KeyPair, SignedCertificate } from "./types";
import {
	CertBodyBuilder,
	type CertBodyBuilderOptions,
} from "./validation/cert-body-builder";

export interface SignOptions extends CertSignRequest {
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
	return Buffer.from(lines.join(""), "base64").toString(CRYPTO.UTF8);
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

interface CertBuildParams {
	builder: CertBodyBuilder;
	csrData: ReturnType<typeof parseCsr>;
	serialNumber: string;
	now: Date;
	expiresAt: Date;
	publicKeyPem: string;
	caKeyPair: KeyPair;
	caCertPem: string;
}

function _buildCert(params: CertBuildParams): {
	certBody: string;
	signature: string;
	certPem: string;
} {
	const certBody = params.builder.build(
		_buildCertificateOptions({
			serialNumber: params.serialNumber,
			now: params.now,
			expiresAt: params.expiresAt,
			publicKeyPem: params.publicKeyPem,
			commonName: params.csrData.commonName,
			san: params.csrData.san,
		})
	);
	const signature = params.builder.signCertBody(
		certBody,
		params.caKeyPair.privateKey
	);
	const certPem = params.builder.buildCertPem(
		certBody,
		signature,
		params.caCertPem
	);
	return { certBody, signature, certPem };
}

interface SignedCertResultParams {
	serialNumber: string;
	certPem: string;
	caCertPem: string;
	serviceId: import("@trading-model/common/domain/primitives").ServiceId;
	now: Date;
	expiresAt: Date;
}

function _buildSignedCertificateResult(
	params: SignedCertResultParams
): SignedCertificate {
	const fingerprint = createHash(CRYPTO.SHA256).update(params.certPem).digest(CRYPTO.HEX);
	return {
		serialNumber: toSerialNumber(params.serialNumber),
		certPem: params.certPem,
		caPem: params.caCertPem,
		serviceId: params.serviceId,
		issuedAt: params.now,
		expiresAt: params.expiresAt,
		fingerprint: toFingerprint(fingerprint),
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
	const { certPem } = _buildCert({
		builder,
		csrData,
		serialNumber,
		now,
		expiresAt,
		publicKeyPem,
		caKeyPair,
		caCertPem,
	});
	return _buildSignedCertificateResult({
		serialNumber,
		certPem,
		caCertPem,
		serviceId,
		now,
		expiresAt,
	});
}
