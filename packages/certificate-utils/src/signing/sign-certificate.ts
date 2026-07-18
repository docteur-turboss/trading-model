import { createPublicKey } from "node:crypto";
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
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { SubjectName } from "@trading-model/common/domain/subject-name";
import { sha256Hex } from "@trading-model/crypto/crypto/hash-utils";
import { decodePem } from "../format/format";
import type { CaCredentials, SignedCertificate } from "../keygen/types";
import { generateSerialNumber } from "../utils/serial-number-utils";
import {
	CertBodyBuilder,
	type CertBodyBuilderOptions,
} from "../validation/cert-body-builder";

export interface SignOptions extends CertSignRequest {
	ca: CaCredentials;
	ttlMs: DurationMs;
}

function _buildSerialNumber(): SerialNumber {
	return generateSerialNumber();
}

function _exportPublicKeyPem(
	publicKey: ReturnType<typeof createPublicKey>
): KeyPem {
	return KeyPem.of(publicKey.export({ type: "spki", format: "pem" }));
}

type ParsedCsr = SubjectName<CommonName> & { publicKey: KeyPem };

function parseCsr(
	csr: import("@trading-model/common/domain/primitives").CsrPem
): ParsedCsr {
	const parsed = JSON.parse(decodePem(csr));
	return {
		commonName: toCommonName(parsed.commonName),
		san: parsed.san ?? [],
		publicKey: KeyPem.of(parsed.publicKey),
	};
}

interface CertificateBuildOptions extends SubjectName<CommonName> {
	serialNumber: SerialNumber;
	now: UnixTimestamp;
	expiresAt: UnixTimestamp;
	publicKeyPem: KeyPem;
}

function _buildCertificateOptions(
	params: CertificateBuildOptions
): CertBodyBuilderOptions {
	return {
		serialNumber: params.serialNumber,
		now: UnixTimestamp.toDate(params.now),
		expiresAt: UnixTimestamp.toDate(params.expiresAt),
		publicKey: params.publicKeyPem,
		subject: params.commonName,
		san: params.san,
	};
}

interface CertBuildParams {
	builder: CertBodyBuilder;
	certOptions: CertificateBuildOptions;
	ca: CaCredentials;
}

function _buildCert(params: CertBuildParams): {
	certBody: string;
	signature: string;
	certPem: CertPem;
} {
	const certBody = params.builder.build(
		_buildCertificateOptions(params.certOptions)
	);
	const signature = params.builder.signCertBody({
		certBody,
		privateKey: params.ca.caKeyPair.privateKey,
	});
	const certPem = params.builder.buildCertPem(
		certBody,
		signature,
		params.ca.caCertPem
	);
	return { certBody, signature, certPem: toCertPem(certPem) };
}

interface SignedCertResultParams {
	serialNumber: SerialNumber;
	certPem: CertPem;
	caCertPem: CaPem;
	serviceId: import("@trading-model/common/domain/primitives").ServiceId;
	now: UnixTimestamp;
	expiresAt: UnixTimestamp;
}

function _buildSignedCertificateResult(
	params: SignedCertResultParams
): SignedCertificate {
	const fingerprint = sha256Hex(params.certPem);
	return {
		serialNumber: params.serialNumber,
		certPem: params.certPem,
		caPem: params.caCertPem,
		serviceId: params.serviceId,
		issuedAt: params.now,
		expiresAt: params.expiresAt,
		fingerprint: toFingerprint(fingerprint),
	};
}

export function signCertificate(options: SignOptions): SignedCertificate {
	const { csr, serviceId, ca, ttlMs } = options;
	const csrData = parseCsr(csr);
	const serialNumber = _buildSerialNumber();
	const now = UnixTimestamp.now();
	const expiresAt = UnixTimestamp.add(now, ttlMs);
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
		ca,
	});
	return _buildSignedCertificateResult({
		serialNumber,
		certPem,
		caCertPem: ca.caCertPem,
		serviceId,
		now,
		expiresAt,
	});
}
