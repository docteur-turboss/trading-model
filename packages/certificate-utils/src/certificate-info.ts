import { createHash } from "node:crypto";

import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import {
	toCommonName,
	toFingerprint,
	toSerialNumber,
} from "@trading-model/common/domain/primitives";
import type { CertificateInfo } from "./types";

function _decodeCertBody(certPem: string): string {
	const lines = certPem
		.split("\n")
		.filter(
			(line) => !(line.startsWith("-----BEGIN") || line.startsWith("-----END"))
		);
	const decoded = Buffer.from(lines.join(""), "base64").toString(
		CryptoAlg.UTF8
	);
	return (JSON.parse(decoded) as { body: string }).body;
}

function _extractField(body: string, pattern: RegExp): string {
	return body.match(pattern)?.[1] ?? "";
}

function _extractSan(body: string): string[] {
	return _extractField(body, /SAN: (.+)/)
		.split(", ")
		.filter(Boolean);
}

function _parseCertFields(body: string, certPem: string): CertificateInfo {
	const serialRaw = _extractField(body, /Serial: (.+)/);
	const subjectRaw = _extractField(body, /Subject: (.+)/);
	const issuerRaw = _extractField(body, /Issuer: (.+)/);
	return {
		serialNumber: serialRaw ? toSerialNumber(serialRaw) : ("" as never),
		subject: subjectRaw ? toCommonName(subjectRaw) : ("" as never),
		issuer: issuerRaw ? toCommonName(issuerRaw) : ("" as never),
		notBefore: new Date(_extractField(body, /Not Before: (.+)/)),
		notAfter: new Date(_extractField(body, /Not After: (.+)/)),
		fingerprint: toFingerprint(
			createHash(CryptoAlg.SHA256).update(certPem).digest(CryptoAlg.HEX)
		),
		san: _extractSan(body).map((cn) => toCommonName(cn)),
	};
}

export function certificateInfo(certPem: string): CertificateInfo {
	const body = _decodeCertBody(certPem);
	return _parseCertFields(body, certPem);
}
