import { createPublicKey, createVerify } from "node:crypto";
import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";

export interface CertificateValidationInput {
	certPem: string;
	caCertPem?: string;
}

/** Clears any cached validation results. */
export function clearValidationCache(): void {}

export interface ValidationResult {
	valid: boolean;
	reason?: string;
}

function _extractDateField(body: string, pattern: RegExp): Date {
	return new Date(body.match(pattern)?.[1] ?? "");
}

interface ParsedCertData {
	body: string;
	signature: string;
	issuerCert: string;
}

function _verifySignature(cert: ParsedCertData): boolean {
	const caKey = createPublicKey(cert.issuerCert);
	const verify = createVerify(CryptoAlg.SHA256);
	verify.update(cert.body);
	return verify.verify(caKey, cert.signature, "base64");
}

function _validateCertTiming(body: string): ValidationResult | null {
	const now = new Date();
	const notAfter = _extractDateField(body, /Not After: (.+)/);
	const notBefore = _extractDateField(body, /Not Before: (.+)/);

	if (now < notBefore) {
		return { valid: false, reason: "Certificate not yet valid" };
	}
	if (now > notAfter) {
		return { valid: false, reason: "Certificate expired" };
	}
	return null;
}

function _tryValidate(certPem: string): ValidationResult {
	const certData = parseCert(certPem);
	const timingResult = _validateCertTiming(certData.body);
	if (timingResult) {
		return timingResult;
	}
	const isValid = _verifySignature(certData);
	return isValid
		? { valid: true }
		: { valid: false, reason: "Signature verification failed" };
}

export function validateCertificate(
	input: CertificateValidationInput
): ValidationResult {
	const { certPem } = input;
	try {
		return _tryValidate(certPem);
	} catch (err) {
		return {
			valid: false,
			reason: `Validation error: ${(err as Error).message}`,
		};
	}
}

function _decodePemBody(pem: string): string {
	const lines = pem
		.split("\n")
		.filter(
			(line) => !(line.startsWith("-----BEGIN") || line.startsWith("-----END"))
		);
	return Buffer.from(lines.join(""), "base64").toString(CryptoAlg.UTF8);
}

function parseCert(certPem: string): ParsedCertData {
	return JSON.parse(_decodePemBody(certPem));
}
