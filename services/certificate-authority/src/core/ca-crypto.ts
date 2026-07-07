import {
	createCipheriv,
	createDecipheriv,
	randomBytes as cryptoRandomBytes,
} from "node:crypto";

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
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	let encrypted = cipher.update(pem, "utf8", "hex");
	encrypted += cipher.final("hex");
	const tag = cipher.getAuthTag();
	return `aes256gcm:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
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
function _parseEncryptedData(
	data: string
): { iv: Buffer; tag: Buffer; encrypted: string } | null {
	const prefix = "aes256gcm:";
	if (!data.startsWith(prefix)) {
		return null;
	}
	const parts = data.slice(prefix.length).split(":");
	if (parts.length !== 3) {
		throw new Error("Invalid encrypted key format");
	}
	return {
		iv: Buffer.from(parts[0], "hex"),
		tag: Buffer.from(parts[1], "hex"),
		encrypted: parts[2],
	};
}

function _decryptAes256Gcm(
	encrypted: string,
	key: Buffer,
	iv: Buffer,
	tag: Buffer
): string {
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	let decrypted = decipher.update(encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");
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
	if (!keyBase64) return data;
	const parsed = _parseEncryptedData(data);
	if (!parsed) return data;
	const key = _validateKeyLength(keyBase64);
	const result = _decryptAes256Gcm(parsed.encrypted, key, parsed.iv, parsed.tag);
	_zeroBuffers(key, parsed.iv, parsed.tag);
	return result;
}
