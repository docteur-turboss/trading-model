import { createPublicKey, createVerify, KeyObject } from 'node:crypto';

import { logger } from '@trading-model/common/config/logger';

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

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
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
const ALGORITHM_MAP: Record<string, string> = {
  RS256: 'RSA-SHA256',
  RS384: 'RSA-SHA384',
  RS512: 'RSA-SHA512',
  ES256: 'SHA256',
  ES384: 'SHA384',
  ES512: 'SHA512',
};

export class OidcVerifier {
  private readonly config: OidcConfig;
  private readonly allowedAlgorithms: Set<string>;
  private cachedKeys: Map<string, KeyObject> | null = null;
  private lastFetch = 0;
  private readonly cacheTtlMs = 3_600_000;

  constructor(config: OidcConfig) {
    this.config = config;
    this.allowedAlgorithms = new Set(config.allowedAlgorithms ?? ['RS256', 'ES256']);
  }

  async verifyAndExtract(token: string): Promise<OidcClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const header = this.parseBase64Json<JwtHeader>(parts[0]);
    const payload = this.parseBase64Json<OidcClaims>(parts[1]);

    // 6a: Reject tokens with disallowed algorithms
    if (!this.allowedAlgorithms.has(header.alg)) {
      throw new Error(
        `JWT algorithm "${header.alg}" is not allowed. Must be one of: ${[...this.allowedAlgorithms].join(', ')}`
      );
    }

    if (payload.iss !== this.config.issuer) {
      throw new Error(`JWT issuer mismatch: expected ${this.config.issuer}, got ${payload.iss}`);
    }

    const aud = payload.aud;
    const audiences = Array.isArray(aud) ? aud : [aud];
    if (!audiences.includes(this.config.audience)) {
      throw new Error(`JWT audience mismatch: expected ${this.config.audience}`);
    }

    if (payload.exp * 1000 < Date.now()) {
      throw new Error('JWT expired');
    }

    if (payload.nbf && payload.nbf * 1000 > Date.now()) {
      throw new Error('JWT not yet valid (nbf)');
    }

    const signingKey = await this.resolveSigningKey(header.kid);
    const message = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], 'base64url');

    // 6a: Use algorithm from whitelist — safe from alg:none and alg confusion
    const algorithm = this.toNodeCryptoAlgorithm(header.alg);
    const verified = createVerify(algorithm).update(message).verify(signingKey, signature);

    if (!verified) {
      throw new Error('JWT signature verification failed');
    }

    return payload;
  }

  private async resolveSigningKey(kid?: string): Promise<KeyObject> {
    await this.refreshKeys();
    if (this.cachedKeys) {
      if (kid) {
        const key = this.cachedKeys.get(kid);
        if (key) return key;
      }
      if (!kid && this.cachedKeys.size === 1) {
        const firstKey = this.cachedKeys.values().next().value;
        if (firstKey) return firstKey;
      }
    }
    throw new Error(`Signing key not found (kid: ${kid ?? 'none'})`);
  }

  private async refreshKeys(): Promise<void> {
    if (this.cachedKeys && Date.now() - this.lastFetch < this.cacheTtlMs) {
      return;
    }

    const jwksUri = this.config.jwksUri;
    if (!jwksUri) {
      throw new Error('JWKS URI not configured');
    }

    try {
      const response = await fetch(jwksUri, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status}`);
      }
      const jwks = (await response.json()) as JwksResponse;
      this.cachedKeys = new Map<string, KeyObject>();

      for (const jwk of jwks.keys) {
        if (jwk.kty === 'RSA' && jwk.n && jwk.e) {
          const key = createPublicKey({
            key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
            format: 'jwk',
          });
          const kid = jwk.kid ?? jwk.n.slice(0, 16);
          this.cachedKeys.set(kid, key);
        } else if (jwk.kty === 'EC' && jwk.x && jwk.y && jwk.crv) {
          const key = createPublicKey({
            key: { kty: jwk.kty, x: jwk.x, y: jwk.y, crv: jwk.crv },
            format: 'jwk',
          });
          const kid = jwk.kid ?? jwk.x.slice(0, 16);
          this.cachedKeys.set(kid, key);
        }
      }

      this.lastFetch = Date.now();
      logger.info('JWKS keys refreshed', { count: this.cachedKeys.size });
    } catch (err) {
      if (this.cachedKeys && this.cachedKeys.size > 0) {
        logger.warn('JWKS refresh failed, using cached keys', { err });
        return;
      }
      throw err;
    }
  }

  private toNodeCryptoAlgorithm(alg: string): string {
    const mapped = ALGORITHM_MAP[alg];
    if (!mapped) {
      throw new Error(`Unsupported JWT algorithm: ${alg}`);
    }
    return mapped;
  }

  private parseBase64Json<T>(str: string): T {
    try {
      const decoded = Buffer.from(str, 'base64url').toString('utf8');
      return JSON.parse(decoded) as T;
    } catch {
      throw new Error('Failed to parse JWT segment');
    }
  }
}
