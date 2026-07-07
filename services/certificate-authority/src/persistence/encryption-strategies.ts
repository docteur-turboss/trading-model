import type { FileEncryption } from "./fallback-file-reader";
import { decrypt, deriveKey, encrypt } from "./fallback-crypto";

export const NOOP_ENCRYPTION: FileEncryption = {
	extension: ".json",
	serialize: (plaintext: string) => plaintext,
	deserialize: (ciphertext: string) => ciphertext,
};

export class AesEncryption implements FileEncryption {
	readonly extension = ".enc";

	constructor(private readonly _key: Buffer) {}

	serialize(plaintext: string): string {
		return encrypt(plaintext, this._key);
	}

	deserialize(ciphertext: string): string {
		return decrypt(ciphertext, this._key);
	}
}

export function buildEncryption(encryptionKey?: string): FileEncryption {
	if (encryptionKey) return new AesEncryption(deriveKey(encryptionKey));
	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"FsStore: FS_ENCRYPTION_KEY is required in production for encrypted fallback storage. " +
				"Generate with: node -e \"console.log(crypto.randomBytes(32).toString('base64'))\". " +
				"To disable the filesystem fallback entirely (relying solely on MongoDB), set CA_DISABLE_FS_FALLBACK=true. " +
				"Note: disabling FsStore means the CA will crash if MongoDB becomes unavailable."
		);
	}
	return NOOP_ENCRYPTION;
}
