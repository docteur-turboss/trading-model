import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";

const IV_LENGTH = 12;
const REQUIRED_KEY_LENGTH = 32;

export interface AesGcmPayload {
	iv: Buffer;
	tag: Buffer;
	ciphertext: Buffer;
}

export function validateKey(key: Buffer): void {
	if (key.length !== REQUIRED_KEY_LENGTH) {
		throw new Error(
			`Key must be ${REQUIRED_KEY_LENGTH} bytes (256 bits), got ${key.length}`
		);
	}
}

export function zeroBuffer(buf: Buffer): void {
	buf.fill(0);
}

export function encryptAes256Gcm(
	plaintext: string,
	key: Buffer
): AesGcmPayload {
	validateKey(key);
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(CryptoAlg.AES_256_GCM, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, CryptoAlg.UTF8),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return { iv, tag, ciphertext };
}

export function decryptAes256Gcm(payload: AesGcmPayload, key: Buffer): string {
	validateKey(key);
	const decipher = createDecipheriv(CryptoAlg.AES_256_GCM, key, payload.iv);
	decipher.setAuthTag(payload.tag);
	return Buffer.concat([
		decipher.update(payload.ciphertext),
		decipher.final(),
	]).toString(CryptoAlg.UTF8);
}
