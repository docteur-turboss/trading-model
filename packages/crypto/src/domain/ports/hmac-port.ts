export type HmacDigestEncoding = "hex" | "base64" | "base64url";

export interface HmacSha256Input {
	secret: string;
	parts: string[];
	separator: string;
	digest: HmacDigestEncoding;
}

/** Abstract HMAC-SHA256 capability. Implemented by infrastructure adapters. */
export interface HmacPort {
	createHmacSha256(secret: string, ...parts: string[]): string;
	createHmacSha256Formatted(input: HmacSha256Input): string;
	verifyHmacSha256(
		secret: string,
		signature: string,
		...parts: string[]
	): boolean;
	verifyHmacSha256Formatted(
		input: HmacSha256Input & { signature: string }
	): boolean;
}
