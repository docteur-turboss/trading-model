import { createPublicKey, type KeyObject } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";

import type { OidcConfig } from "./oidc-verifier";

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

export class JwksKeyProvider {
	private _cachedKeys: Map<string, KeyObject> | null = null;
	private _lastFetch = 0;
	private readonly _cacheTtlMs = 3_600_000;
	private readonly _config: Pick<OidcConfig, "jwksUri">;

	constructor(config: Pick<OidcConfig, "jwksUri">) {
		this._config = config;
	}

	async resolveSigningKey(kid?: string): Promise<KeyObject> {
		await this._refreshKeys();
		if (this._cachedKeys) {
			if (kid) {
				const key = this._lookupByKid(kid);
				if (key) return key;
			}
			const singleKey = this._lookupSingleKey();
			if (singleKey) return singleKey;
		}
		throw new Error(`Signing key not found (kid: ${kid ?? "none"})`);
	}

	private _shouldRefresh(): boolean {
		return !this._cachedKeys || Date.now() - this._lastFetch >= this._cacheTtlMs;
	}

	private async _refreshKeys(): Promise<void> {
		if (!this._shouldRefresh()) {
			return;
		}
		if (!this._config.jwksUri) {
			throw new Error("JWKS URI not configured");
		}
		try {
			await this._fetchAndCacheKeys();
		} catch (err) {
			if (this._cachedKeys && this._cachedKeys.size > 0) {
				logger.warn("JWKS refresh failed, using cached keys", {
					context: { err },
				});
				return;
			}
			throw err;
		}
	}

	private async _fetchAndCacheKeys(): Promise<void> {
		const jwks = await this._fetchJwks(this._config.jwksUri);
		this._cachedKeys = new Map<string, KeyObject>();
		for (const entry of jwks.keys) {
			const parsed = this._parseJwkKey(entry);
			if (parsed) {
				this._cachedKeys.set(parsed.kid, parsed.key);
			}
		}
		this._lastFetch = Date.now();
		logger.info("JWKS keys refreshed", {
			context: { count: this._cachedKeys.size },
		});
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
	): { kid: string; key: KeyObject } | null {
		const fieldN = "n";
		const fieldE = "e";
		const fieldX = "x";
		const fieldY = "y";
		const jwkAny = entry as Record<string, string | undefined>;
		const modulus = jwkAny[fieldN];
		const exponent = jwkAny[fieldE];
		const xCoord = jwkAny[fieldX];
		const yCoord = jwkAny[fieldY];
		if (entry.kty === "RSA" && modulus && exponent) {
			const rsaKey: Record<string, string> = { kty: entry.kty };
			rsaKey[fieldN] = modulus;
			rsaKey[fieldE] = exponent;
			const key = createPublicKey({
				key: rsaKey,
				format: "jwk",
			});
			const kid = entry.kid ?? modulus.slice(0, 16);
			return { kid, key };
		}
		if (entry.kty === "EC" && xCoord && yCoord && entry.crv) {
			const ecKey: Record<string, string> = {
				kty: entry.kty,
				crv: entry.crv,
			};
			ecKey[fieldX] = xCoord;
			ecKey[fieldY] = yCoord;
			const key = createPublicKey({
				key: ecKey,
				format: "jwk",
			});
			const kid = entry.kid ?? xCoord.slice(0, 16);
			return { kid, key };
		}
		return null;
	}

	private _lookupByKid(kid: string): KeyObject | undefined {
		return this._cachedKeys?.get(kid);
	}

	private _lookupSingleKey(): KeyObject | undefined {
		if (this._cachedKeys && this._cachedKeys.size === 1) {
			return this._cachedKeys.values().next().value;
		}
	}
}
