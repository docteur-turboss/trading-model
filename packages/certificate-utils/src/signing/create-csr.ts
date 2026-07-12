import { createPublicKey, createSign } from "node:crypto";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";

export interface CsrSubject {
	commonName: string;
	san: string[];
}

export interface CsrOptions extends CsrSubject {
	keyPem: string;
}

function _buildCsrData(subject: CsrSubject): string {
	const sanExtension = subject.san.map((dns) => `DNS:${dns}`).join(",");
	return [
		"-----BEGIN CERTIFICATE REQUEST-----",
		`CN=${subject.commonName}`,
		`SAN=${sanExtension}`,
		"-----END CERTIFICATE REQUEST-----",
	].join("\n");
}

function _buildCsrBody(params: {
	commonName: string;
	san: string[];
	keyPem: string;
	signature: string;
}): string {
	const publicKey = createPublicKey(params.keyPem);
	return Buffer.from(
		JSON.stringify({
			commonName: params.commonName,
			san: params.san,
			publicKey: publicKey.export({ type: "spki", format: "pem" }),
			signature: params.signature,
		})
	).toString("base64");
}

function _signData(data: string, keyPem: string): string {
	const sign = createSign(CryptoAlg.SHA256);
	sign.update(data);
	return sign.sign(keyPem, "base64");
}

function _formatCsrOutput(csrBody: string): string {
	return [
		"-----BEGIN CERTIFICATE REQUEST-----",
		...chunks(csrBody, 64),
		"-----END CERTIFICATE REQUEST-----",
	].join("\n");
}

export function createCsr(options: CsrOptions): string {
	const { commonName, san, keyPem } = options;
	const csrData = _buildCsrData({ commonName, san });
	const signature = _signData(csrData, keyPem);
	const csrBody = _buildCsrBody({ commonName, san, keyPem, signature });
	return _formatCsrOutput(csrBody);
}

function chunks(str: string, size: number): string[] {
	const result: string[] = [];
	for (let i = 0; i < str.length; i += size) {
		result.push(str.slice(i, i + size));
	}
	return result;
}
