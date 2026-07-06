import { createPublicKey, type KeyObject } from "node:crypto";

interface Jwk extends Record<string, string | undefined> {
	kid?: string;
	kty: string;
	alg?: string;
	use?: string;
	crv?: string;
}

interface JwksResponse {
	keys: Jwk[];
}

interface ParsedJwk {
	kid: string;
	key: KeyObject;
}

export class JwkFetcher {
	async fetch(uri: string): Promise<ParsedJwk[]> {
		const jwks = await this._fetchJwks(uri);
		const parsed: ParsedJwk[] = [];
		for (const entry of jwks.keys) {
			const result = this._parseJwkKey(entry);
			if (result) {
				parsed.push(result);
			}
		}
		return parsed;
	}

	private async _fetchJwks(uri: string): Promise<JwksResponse> {
		const response = await fetch(uri, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			throw new Error(`JWKS fetch failed: ${response.status}`);
		}
		return (await response.json()) as JwksResponse;
	}

	private _parseJwkKey(
		entry: Jwk,
	): ParsedJwk | null {
		const { n: modulus, e: exponent, x: xCoord, y: yCoord } = entry as Record<string, string | undefined>;
		if (entry.kty === "RSA" && modulus && exponent) {
			const key = createPublicKey({
				key: { kty: entry.kty, n: modulus, e: exponent },
				format: "jwk",
			});
			const kid = entry.kid ?? modulus.slice(0, 16);
			return { kid, key };
		}
		if (entry.kty === "EC" && xCoord && yCoord && entry.crv) {
			const key = createPublicKey({
				key: { kty: entry.kty, crv: entry.crv, x: xCoord, y: yCoord },
				format: "jwk",
			});
			const kid = entry.kid ?? xCoord.slice(0, 16);
			return { kid, key };
		}
		return null;
	}
}
