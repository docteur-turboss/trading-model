import {
	createPrivateKey,
	createPublicKey,
	X509Certificate,
} from "node:crypto";

import forge from "node-forge";

export function chunks(str: string, size: number): string[] {
	const result: string[] = [];
	for (let i = 0; i < str.length; i += size) {
		result.push(str.slice(i, i + size));
	}
	return result;
}

/** @deprecated Use X509Certificate for parsing certificates. */
export function parsePem<TValue = unknown>(_pem: string): TValue {
	throw new Error(
		"parsePem is deprecated — use X509Certificate or certificationRequestFromPem"
	);
}

/** @deprecated Use X509Certificate.publicKey instead. */
export function extractPublicKeyFromBody(_body: string): string | null {
	throw new Error("extractPublicKeyFromBody is deprecated");
}

export function resolvePublicKey(
	issuerCert: string
): ReturnType<typeof createPublicKey> {
	return createPublicKey(issuerCert);
}

function _extractSanFromX509(x509: X509Certificate): string[] {
	return (x509.subjectAltName ?? "")
		.split(", ")
		.filter((entry) => entry.startsWith("DNS:"))
		.map((name) => name.slice(4));
}

import type {
	Fingerprint,
	SerialNumber,
} from "@trading-model/common/domain/primitives";
import {
	toFingerprint,
	toSerialNumber,
} from "@trading-model/common/domain/primitives";

function _parseSerialNumber(pem: string): SerialNumber {
	const forgeCert = forge.pki.certificateFromPem(pem);
	return toSerialNumber(forgeCert.serialNumber);
}

function _parseSubject(cert: X509Certificate): string {
	return cert.subject;
}

function _parseValidity(
	cert: X509Certificate
): { validFrom: Date; validTo: Date } {
	return {
		validFrom: new Date(cert.validFrom),
		validTo: new Date(cert.validTo),
	};
}

export function parseCertInfo(pem: string): {
	subject: string;
	issuer: string;
	serialNumber: SerialNumber;
	notBefore: Date;
	notAfter: Date;
	fingerprint: Fingerprint;
	san: string[];
} {
	const x509 = new X509Certificate(pem);
	const { validFrom, validTo } = _parseValidity(x509);
	return {
		subject: _parseSubject(x509),
		issuer: x509.issuer,
		serialNumber: _parseSerialNumber(pem),
		notBefore: validFrom,
		notAfter: validTo,
		fingerprint: toFingerprint(
			x509.fingerprint256.replace(/:/g, "").toLowerCase()
		),
		san: _extractSanFromX509(x509),
	};
}

export function privateKeyFromPem(pem: string): forge.pki.PrivateKey {
	const keyObject = createPrivateKey(pem);
	const keyType = keyObject.asymmetricKeyType;
	if (keyType === "ec") {
		const sec1 = keyObject.export({ type: "sec1", format: "pem" });
		return forge.pki.privateKeyFromPem(sec1);
	}
	const pkcs1 = keyObject.export({ type: "pkcs1", format: "pem" });
	return forge.pki.privateKeyFromPem(pkcs1);
}

interface CsrExtension {
	name: string;
	altNames?: Array<{ type: number; value: string }>;
}

function _parseCsrResult(
	csr: ReturnType<typeof forge.pki.certificationRequestFromPem>
): { commonName: string; san: string[]; publicKeyPem: string } {
	return {
		commonName: csr.subject.getField("CN")?.value ?? "",
		san: _extractSanFromCsr(csr),
		publicKeyPem: csr.publicKey ? forge.pki.publicKeyToPem(csr.publicKey) : "",
	};
}

export function parseCsrInfo(csrPem: string): {
	commonName: string;
	san: string[];
	publicKeyPem: string;
} {
	const csr = forge.pki.certificationRequestFromPem(csrPem);
	return _parseCsrResult(csr);
}

function _extractSanFromCsr(
	csr: ReturnType<typeof forge.pki.certificationRequestFromPem>
): string[] {
	const sanAttr = csr.getAttribute({ name: "extensionRequest" });
	if (!sanAttr) {
		return [];
	}
	const extensions = (sanAttr as unknown as { extensions: CsrExtension[] })
		.extensions;
	if (!extensions) {
		return [];
	}
	const sanExt = extensions.find((ext) => ext.name === "subjectAltName");
	if (!sanExt?.altNames) {
		return [];
	}
	return sanExt.altNames
		.filter((alt) => alt.type === 2)
		.map((alt) => alt.value);
}
