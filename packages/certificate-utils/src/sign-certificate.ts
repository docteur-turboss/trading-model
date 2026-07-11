import { createHash, createPublicKey, randomUUID } from "node:crypto";

import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import type {
	CaPem,
	CertPem,
	CommonName,
	DurationMs,
	SerialNumber,
} from "@trading-model/common/domain/primitives";
import {
	KeyPem,
	toCertPem,
	toCommonName,
	toFingerprint,
	toSerialNumber,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { KeyPair, SignedCertificate } from "./types";
import {
	CertBodyBuilder,
	type CertBodyBuilderOptions,
} from "./validation/cert-body-builder";

export interface SignOptions extends CertSignRequest {
	caKeyPair: KeyPair;
	caCertPem: CaPem;
	ttlMs: DurationMs;
}

function _buildSerialNumber(): SerialNumber {
	return toSerialNumber(
		randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase()
	);
}

function _exportPublicKeyPem(
	publicKey: ReturnType<typeof createPublicKey>
): KeyPem {
	return KeyPem.of(publicKey.export({ type: "spki", format: "pem" }));
}

function _parseCsrBody(csr: string): string {
	const lines = csr
		.split("\n")
		.filter(
			(line) => !(line.startsWith("-----BEGIN") || line.startsWith("-----END"))
		);
	return Buffer.from(lines.join(""), "base64").toString(CryptoAlg.UTF8);
}

function parseCsr(
	csr: import("@trading-model/common/domain/primitives").CsrPem
): {
	commonName: CommonName;
	san: string[];
	publicKey: KeyPem;
} {
	const parsed = JSON.parse(_parseCsrBody(csr));
	return {
		commonName: toCommonName(parsed.commonName),
		san: parsed.san ?? [],
		publicKey: KeyPem.of(parsed.publicKey),
	};
}

interface CertificateBuildOptions {
	serialNumber: SerialNumber;
	now: Date;
	expiresAt: Date;
	publicKeyPem: KeyPem;
	commonName: CommonName;
	san: string[];
}

function _buildCertificateOptions(
	params: CertificateBuildOptions
): CertBodyBuilderOptions {
	return {
		serialNumber: params.serialNumber,
		now: params.now,
		expiresAt: params.expiresAt,
		publicKey: params.publicKeyPem,
		subject: params.commonName,
		san: params.san,
	};
}

interface CertBuildParams {
	builder: CertBodyBuilder;
	certOptions: CertificateBuildOptions;
	caKeyPair: KeyPair;
	caCertPem: CaPem;
}

function _buildCert(params: CertBuildParams): {
	certBody: string;
	signature: string;
	certPem: CertPem;
} {
	const certBody = params.builder.build(
		_buildCertificateOptions(params.certOptions)
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
	return { certBody, signature, certPem: toCertPem(certPem) };
}

interface SignedCertResultParams {
	serialNumber: SerialNumber;
	certPem: CertPem;
	caCertPem: CaPem;
	serviceId: import("@trading-model/common/domain/primitives").ServiceId;
	now: Date;
	expiresAt: Date;
}

function _buildSignedCertificateResult(
	params: SignedCertResultParams
): SignedCertificate {
	const fingerprint = createHash(CryptoAlg.SHA256)
		.update(params.certPem)
		.digest(CryptoAlg.HEX);
	return {
		serialNumber: params.serialNumber,
		certPem: params.certPem,
		caPem: params.caCertPem,
		serviceId: params.serviceId,
		issuedAt: params.now,
		expiresAt: UnixTimestamp.of(params.expiresAt.getTime()),
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
		certOptions: {
			serialNumber,
			now,
			expiresAt,
			publicKeyPem,
			commonName: csrData.commonName,
			san: csrData.san,
		},
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
