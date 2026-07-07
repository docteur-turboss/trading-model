import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function deriveKey(base64Key: string): Buffer {
	const key = Buffer.from(base64Key, "base64");
	if (key.length !== 32) {
		throw new Error(
			`FS_ENCRYPTION_KEY must be 32 bytes (got ${key.length}). Generate with: node -e "console.log(crypto.randomBytes(32).toString('base64'))"`
		);
	}
	return key;
}

export function encrypt(plaintext: string, key: Buffer): string {
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function _validateIv(iv: Buffer): void {
	if (iv.length !== 12 && iv.length !== 16) {
		throw new Error(
			`Invalid IV length: ${iv.length} bytes (expected 12 or 16)`
		);
	}
}

interface EncryptedPayload {
	iv: Buffer;
	tag: Buffer;
	encrypted: Buffer;
}

function _parseEncryptedPayload(ciphertext: string): EncryptedPayload {
	const parts = ciphertext.split(":");
	if (parts.length !== 3) {
		throw new Error("Invalid encrypted payload format");
	}
	const iv = Buffer.from(parts[0], "base64");
	_validateIv(iv);
	const tag = Buffer.from(parts[1], "base64");
	const encrypted = Buffer.from(parts[2], "base64");
	return { iv, tag, encrypted };
}

export function decrypt(ciphertext: string, key: Buffer): string {
	const { iv, tag, encrypted } = _parseEncryptedPayload(ciphertext);
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
		"utf8"
	);
}
