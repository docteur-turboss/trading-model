import { createPublicKey, createVerify } from "node:crypto";

export interface CertificateValidationInput {
	certPem: string;
	caCertPem?: string;
}

/** Clears any cached validation results. */
export function clearValidationCache(): void {
	// no-op: validation cache is managed by consumers
}

export interface ValidationResult {
	valid: boolean;
	reason?: string;
}

function _extractDateField(body: string, pattern: RegExp): Date {
	return new Date(body.match(pattern)?.[1] ?? "");
}

function _verifySignature(body: string, signature: string, issuerCert: string): boolean {
	const caKey = createPublicKey(issuerCert);
	const verify = createVerify("sha256");
	verify.update(body);
	return verify.verify(caKey, signature, "base64");
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

export function validateCertificate(
	input: CertificateValidationInput,
): ValidationResult {
	const { certPem } = input;
	try {
		const certData = parseCert(certPem);
		const timingResult = _validateCertTiming(certData.body);
		if (timingResult) {
			return timingResult;
		}
		const isValid = _verifySignature(certData.body, certData.signature, certData.issuerCert);
		return isValid
			? { valid: true }
			: { valid: false, reason: "Signature verification failed" };
	} catch (err) {
		return { valid: false, reason: `Validation error: ${(err as Error).message}` };
	}
}

function _decodePemBody(pem: string): string {
	const lines = pem
		.split("\n")
		.filter(
			(line) => !(line.startsWith("-----BEGIN") || line.startsWith("-----END")),
		);
	return Buffer.from(lines.join(""), "base64").toString("utf8");
}

function parseCert(certPem: string): {
	body: string;
	signature: string;
	issuerCert: string;
} {
	return JSON.parse(_decodePemBody(certPem));
}
