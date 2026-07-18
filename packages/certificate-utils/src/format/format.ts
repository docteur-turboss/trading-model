export function chunks(str: string, size: number): string[] {
	const result: string[] = [];
	for (let i = 0; i < str.length; i += size) {
		result.push(str.slice(i, i + size));
	}
	return result;
}

export function decodePem(pem: string): string {
	const lines = pem
		.split("\n")
		.filter(
			(line) => !(line.startsWith("-----BEGIN") || line.startsWith("-----END"))
		);
	return Buffer.from(lines.join(""), "base64").toString("utf8");
}

export { privateKeyFromPem, resolvePublicKey } from "../keygen/key-converter";
export { CertificateParser } from "../validation/certificate-parser";
export { CsrParser } from "../validation/csr-parser";

import { CertificateParser } from "../validation/certificate-parser";
import { CsrParser } from "../validation/csr-parser";

const certParser = new CertificateParser();
const csrParser = new CsrParser();

export function parseCertInfo(pem: string) {
	return certParser.parse(pem);
}

export function parseCsrInfo(csrPem: string) {
	return csrParser.parse(csrPem);
}
