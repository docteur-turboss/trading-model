import { createPublicKey, type KeyObject } from "node:crypto";
import type { URLString } from "@trading-model/common/domain/primitives";
import { JWK_KEY_TYPE } from "@trading-model/crypto/crypto/crypto-constants";

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
	async fetch(uri: URLString): Promise<ParsedJwk[]> {
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

	private async _fetchJwks(uri: URLString): Promise<JwksResponse> {
		const response = await fetch(uri, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			throw new Error(`JWKS fetch failed: ${response.status}`);
		}
		return (await response.json()) as JwksResponse;
	}

	private _parseRsaKey(
		entry: Jwk,
		modulus: string,
		exponent: string
	): ParsedJwk {
		const key = createPublicKey({
			key: { kty: entry.kty, n: modulus, e: exponent },
			format: "jwk",
		});
		return { kid: entry.kid ?? modulus.slice(0, 16), key };
	}

	private _parseEcKey(entry: Jwk, xCoord: string, yCoord: string): ParsedJwk {
		const key = createPublicKey({
			key: { kty: entry.kty, crv: entry.crv!, x: xCoord, y: yCoord },
			format: "jwk",
		});
		return { kid: entry.kid ?? xCoord.slice(0, 16), key };
	}

	private _parseJwkKey(entry: Jwk): ParsedJwk | null {
		const {
			n: modulus,
			e: exponent,
			x: xCoord,
			y: yCoord,
		} = entry as Record<string, string | undefined>;
		if (entry.kty === JWK_KEY_TYPE.RSA && modulus && exponent) {
			return this._parseRsaKey(entry, modulus, exponent);
		}
		if (entry.kty === JWK_KEY_TYPE.EC && xCoord && yCoord && entry.crv) {
			return this._parseEcKey(entry, xCoord, yCoord);
		}
		return null;
	}
}
