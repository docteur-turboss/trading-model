export const CRYPTO = {
	SHA256: "sha256",
	SHA512: "sha512",
	RSA_SHA256: "RSA-SHA256",
	UTF8: "utf8",
	BASE64URL: "base64url",
	HEX: "hex",
	AES_256_GCM: "aes-256-gcm",
} as const;

export const JWK_KEY_TYPE = {
	RSA: "RSA",
	EC: "EC",
	OKP: "OKP",
} as const;

export type JwkKeyType = (typeof JWK_KEY_TYPE)[keyof typeof JWK_KEY_TYPE];
