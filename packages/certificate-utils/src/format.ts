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

export { CertificateParser } from "./certificate-parser";
export { CsrParser } from "./csr-parser";
export { KeyConverter } from "./key-converter";

import { CertificateParser } from "./certificate-parser";
import { CsrParser } from "./csr-parser";
import { KeyConverter } from "./key-converter";

const certParser = new CertificateParser();
const csrParser = new CsrParser();
const keyConverter = new KeyConverter();

export function parseCertInfo(pem: string) {
	return certParser.parse(pem);
}

export function parseCsrInfo(csrPem: string) {
	return csrParser.parse(csrPem);
}

export function privateKeyFromPem(pem: string) {
	return keyConverter.privateKeyFromPem(pem);
}

export function resolvePublicKey(issuerCert: string) {
	return keyConverter.resolvePublicKey(issuerCert);
}
