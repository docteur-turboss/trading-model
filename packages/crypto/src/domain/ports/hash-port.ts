/** Abstract hashing capability. Implemented by infrastructure adapters. */
export interface HashPort {
	sha256Hex(input: string): string;
	sha256Base64url(input: string): string;
}
