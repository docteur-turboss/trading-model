import { createPublicKey, createSign } from "node:crypto";

export interface CsrOptions {
	commonName: string;
	san: string[];
	keyPem: string;
}

function _buildCsrData(commonName: string, san: string[]): string {
	const sanExtension = san.map((dns) => `DNS:${dns}`).join(",");
	return [
		"-----BEGIN CERTIFICATE REQUEST-----",
		`CN=${commonName}`,
		`SAN=${sanExtension}`,
		"-----END CERTIFICATE REQUEST-----",
	].join("\n");
}

function _buildCsrBody(
	commonName: string,
	san: string[],
	keyPem: string,
	signature: string,
): string {
	const publicKey = createPublicKey(keyPem);
	return Buffer.from(
		JSON.stringify({
			commonName,
			san,
			publicKey: publicKey.export({ type: "spki", format: "pem" }),
			signature,
		}),
	).toString("base64");
}

function _signData(data: string, keyPem: string): string {
	const sign = createSign("sha256");
	sign.update(data);
	return sign.sign(keyPem, "base64");
}

export function createCsr(options: CsrOptions): string {
	const { commonName, san, keyPem } = options;
	const csrData = _buildCsrData(commonName, san);
	const signature = _signData(csrData, keyPem);
	const csrBody = _buildCsrBody(commonName, san, keyPem, signature);
	return [
		"-----BEGIN CERTIFICATE REQUEST-----",
		...chunks(csrBody, 64),
		"-----END CERTIFICATE REQUEST-----",
	].join("\n");
}

function chunks(str: string, size: number): string[] {
	const result: string[] = [];
	for (let i = 0; i < str.length; i += size) {
		result.push(str.slice(i, i + size));
	}
	return result;
}
