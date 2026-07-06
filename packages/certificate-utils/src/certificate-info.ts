import { createHash } from "node:crypto";

import {
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
	const decoded = Buffer.from(lines.join(""), "base64").toString("utf8");
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

export function certificateInfo(certPem: string): CertificateInfo {
	const body = _decodeCertBody(certPem);
	return {
		serialNumber: toSerialNumber(_extractField(body, /Serial: (.+)/)),
		subject: _extractField(body, /Subject: (.+)/),
		issuer: _extractField(body, /Issuer: (.+)/),
		notBefore: new Date(_extractField(body, /Not Before: (.+)/)),
		notAfter: new Date(_extractField(body, /Not After: (.+)/)),
		fingerprint: toFingerprint(
			createHash("sha256").update(certPem).digest("hex")
		),
		san: _extractSan(body),
	};
}
