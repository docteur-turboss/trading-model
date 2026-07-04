import { createPublicKey, createVerify, type KeyObject } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";

export interface OidcConfig {
	issuer: string;
	audience: string;
	jwksUri: string;
	/**
	 * Whitelist of allowed JWT signing algorithms.
	 * Prevents algorithm confusion attacks (e.g., alg:none, or HMAC with RSA public key).
	 * @default ['RS256', 'ES256']
	 */
	allowedAlgorithms?: string[];
}

export interface OidcClaims {
	sub: string;
	iss: string;
	aud: string | string[];
	exp: number;
	iat: number;
	nbf?: number;
	[key: string]: unknown;
}

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

interface JwtHeader {
	alg: string;
	kid?: string;
	typ?: string;
}

/**
 * Maps JWT algorithm names to Node.js crypto algorithm names.
 * Only asymmetric algorithms are supported (RSA, ECDSA).
 * Symmetric algorithms (HS256, HS384, HS512) are explicitly rejected
 * to prevent key confusion attacks where an attacker uses the JWKS
 * public key as an HMAC secret.
 */
const ALGORITHM_MAP = new Map<string, string>([
	["RS256", "RSA-SHA256"],
	["RS384", "RSA-SHA384"],
	["RS512", "RSA-SHA512"],
	["ES256", "SHA256"],
	["ES384", "SHA384"],
	["ES512", "SHA512"],
]);

export class OidcVerifier {
	private readonly _config: OidcConfig;
	private readonly _allowedAlgorithms: Set<string>;
	private _cachedKeys: Map<string, KeyObject> | null = null;
	private _lastFetch = 0;
	private readonly _cacheTtlMs = 3_600_000;

	constructor(config: OidcConfig) {
		this._config = config;
		this._allowedAlgorithms = new Set(
			config.allowedAlgorithms ?? ["RS256", "ES256"]
		);
	}

	async verifyAndExtract(token: string): Promise<OidcClaims> {
		const parts = token.split(".");
		if (parts.length !== 3) {
			throw new Error("Invalid JWT format");
		}

		const header = this._parseBase64Json<JwtHeader>(parts[0]);
		const payload = this._parseBase64Json<OidcClaims>(parts[1]);

		// 6a: Reject tokens with disallowed algorithms
		if (!this._allowedAlgorithms.has(header.alg)) {
			throw new Error(
				`JWT algorithm "${header.alg}" is not allowed. Must be one of: ${[...this._allowedAlgorithms].join(", ")}`
			);
		}

		if (payload.iss !== this._config.issuer) {
			throw new Error(
				`JWT issuer mismatch: expected ${this._config.issuer}, got ${payload.iss}`
			);
		}

		const aud = payload.aud;
		const audiences = Array.isArray(aud) ? aud : [aud];
		if (!audiences.includes(this._config.audience)) {
			throw new Error(
				`JWT audience mismatch: expected ${this._config.audience}`
			);
		}

		if (payload.exp * 1000 < Date.now()) {
			throw new Error("JWT expired");
		}

		if (payload.nbf && payload.nbf * 1000 > Date.now()) {
			throw new Error("JWT not yet valid (nbf)");
		}

		const signingKey = await this._resolveSigningKey(header.kid);
		const message = `${parts[0]}.${parts[1]}`;
		const signature = Buffer.from(parts[2], "base64url");

		// 6a: Use algorithm from whitelist — safe from alg:none and alg confusion
		const algorithm = this._toNodeCryptoAlgorithm(header.alg);
		const verified = createVerify(algorithm)
			.update(message)
			.verify(signingKey, signature);

		if (!verified) {
			throw new Error("JWT signature verification failed");
		}

		return payload;
	}

	private async _resolveSigningKey(kid?: string): Promise<KeyObject> {
		await this._refreshKeys();
		if (this._cachedKeys) {
			if (kid) {
				const key = this._cachedKeys.get(kid);
				if (key) {
					return key;
				}
			}
			if (!kid && this._cachedKeys.size === 1) {
				const firstKey = this._cachedKeys.values().next().value;
				if (firstKey) {
					return firstKey;
				}
			}
		}
		throw new Error(`Signing key not found (kid: ${kid ?? "none"})`);
	}

	private async _refreshKeys(): Promise<void> {
		if (this._cachedKeys && Date.now() - this._lastFetch < this._cacheTtlMs) {
			return;
		}

		const jwksUri = this._config.jwksUri;
		if (!jwksUri) {
			throw new Error("JWKS URI not configured");
		}

		try {
			const response = await fetch(jwksUri, {
				signal: AbortSignal.timeout(10_000),
			});
			if (!response.ok) {
				throw new Error(`JWKS fetch failed: ${response.status}`);
			}
			const jwks = (await response.json()) as JwksResponse;
			this._cachedKeys = new Map<string, KeyObject>();

			for (const entry of jwks.keys) {
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
					this._cachedKeys.set(kid, key);
				} else if (entry.kty === "EC" && xCoord && yCoord && entry.crv) {
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
					this._cachedKeys.set(kid, key);
				}
			}

			this._lastFetch = Date.now();
			logger.info("JWKS keys refreshed", { count: this._cachedKeys.size });
		} catch (err) {
			if (this._cachedKeys && this._cachedKeys.size > 0) {
				logger.warn("JWKS refresh failed, using cached keys", { err });
				return;
			}
			throw err;
		}
	}

	private _toNodeCryptoAlgorithm(alg: string): string {
		const mapped = ALGORITHM_MAP.get(alg);
		if (!mapped) {
			throw new Error(`Unsupported JWT algorithm: ${alg}`);
		}
		return mapped;
	}

	private _parseBase64Json<TData>(str: string): TData {
		try {
			const decoded = Buffer.from(str, "base64url").toString("utf8");
			return JSON.parse(decoded) as T;
		} catch {
			throw new Error("Failed to parse JWT segment");
		}
	}
}
