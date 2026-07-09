import { X509Certificate } from "node:crypto";
import type {
	Fingerprint,
	SerialNumber,
} from "@trading-model/common/domain/primitives";
import {
	toFingerprint,
	toSerialNumber,
} from "@trading-model/common/domain/primitives";
import forge from "node-forge";

export class CertificateParser {
	parse(pem: string): {
		subject: string;
		issuer: string;
		serialNumber: SerialNumber;
		notBefore: Date;
		notAfter: Date;
		fingerprint: Fingerprint;
		san: string[];
	} {
		const x509 = new X509Certificate(pem);
		const { validFrom, validTo } = this._parseValidity(x509);
		return {
			subject: this._parseSubject(x509),
			issuer: x509.issuer,
			serialNumber: this._parseSerialNumber(pem),
			notBefore: validFrom,
			notAfter: validTo,
			fingerprint: toFingerprint(
				x509.fingerprint256.replace(/:/g, "").toLowerCase()
			),
			san: this._extractSanFromX509(x509),
		};
	}

	private _parseSubject(cert: X509Certificate): string {
		return cert.subject;
	}

	private _parseValidity(cert: X509Certificate): {
		validFrom: Date;
		validTo: Date;
	} {
		return {
			validFrom: new Date(cert.validFrom),
			validTo: new Date(cert.validTo),
		};
	}

	private _parseSerialNumber(pem: string): SerialNumber {
		const forgeCert = forge.pki.certificateFromPem(pem);
		return toSerialNumber(forgeCert.serialNumber);
	}

	private _extractSanFromX509(x509: X509Certificate): string[] {
		return (x509.subjectAltName ?? "")
			.split(", ")
			.filter((entry) => entry.startsWith("DNS:"))
			.map((name) => name.slice(4));
	}
}
