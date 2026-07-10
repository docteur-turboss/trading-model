import {
	createCipheriv,
	createDecipheriv,
	randomBytes as cryptoRandomBytes,
} from "node:crypto";

import { CRYPTO } from "@trading-model/common/crypto/crypto-constants";

/**
 * Encrypt a PEM string using AES-256-GCM.
 * @param pem - The PEM text to encrypt
 * @param keyBase64 - Base64-encoded 32-byte (256-bit) encryption key
 * @returns Encrypted string with format: `aes256gcm:<iv_hex>:<tag_hex>:<ciphertext_hex>`
 */
function _validateKeyLength(keyBase64: string): Buffer {
	const key = Buffer.from(keyBase64, "base64");
	if (key.length !== 32) {
		throw new Error(
			"CA_KEY_ENCRYPTION_KEY must be 32 bytes (256 bits), encoded as base64"
		);
	}
	return key;
}

function _encryptAes256Gcm(pem: string, key: Buffer): string {
	const iv = cryptoRandomBytes(12);
	const cipher = createCipheriv(CRYPTO.AES_256_GCM, key, iv);
	let encrypted = cipher.update(pem, CRYPTO.UTF8, CRYPTO.HEX);
	encrypted += cipher.final(CRYPTO.HEX);
	const tag = cipher.getAuthTag();
	return `aes256gcm:${iv.toString(CRYPTO.HEX)}:${tag.toString(CRYPTO.HEX)}:${encrypted}`;
}

export function encryptKey(pem: string, keyBase64: string | undefined): string {
	if (!keyBase64) {
		return pem;
	}
	const key = _validateKeyLength(keyBase64);
	const result = _encryptAes256Gcm(pem, key);
	key.fill(0);
	return result;
}

/**
 * Decrypt a PEM string encrypted with AES-256-GCM.
 * @param data - Encrypted string in format `aes256gcm:<iv_hex>:<tag_hex>:<ciphertext_hex>`
 * @param keyBase64 - Base64-encoded 32-byte (256-bit) decryption key
 * @returns Original PEM text, or the input unchanged if not encrypted
 */
function _parseEncryptedData(data: string): EncryptedPayload | null {
	const prefix = "aes256gcm:";
	if (!data.startsWith(prefix)) {
		return null;
	}
	const parts = data.slice(prefix.length).split(":");
	if (parts.length !== 3) {
		throw new Error("Invalid encrypted key format");
	}
	return {
		iv: Buffer.from(parts[0], CRYPTO.HEX),
		tag: Buffer.from(parts[1], CRYPTO.HEX),
		encrypted: parts[2],
	};
}

interface EncryptedPayload {
	iv: Buffer;
	tag: Buffer;
	encrypted: string;
}

function _decryptAes256Gcm(payload: EncryptedPayload, key: Buffer): string {
	const decipher = createDecipheriv(CRYPTO.AES_256_GCM, key, payload.iv);
	decipher.setAuthTag(payload.tag);
	let decrypted = decipher.update(payload.encrypted, CRYPTO.HEX, CRYPTO.UTF8);
	decrypted += decipher.final(CRYPTO.UTF8);
	return decrypted;
}

function _zeroBuffers(key: Buffer, iv: Buffer, tag: Buffer): void {
	key.fill(0);
	iv.fill(0);
	tag.fill(0);
}

export function decryptKey(
	data: string,
	keyBase64: string | undefined
): string {
	if (!keyBase64) {
		return data;
	}
	const parsed = _parseEncryptedData(data);
	if (!parsed) {
		return data;
	}
	const key = _validateKeyLength(keyBase64);
	const result = _decryptAes256Gcm(parsed, key);
	_zeroBuffers(key, parsed.iv, parsed.tag);
	return result;
}
