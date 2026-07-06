import { createVerify } from "node:crypto";

import { type JwtHeader, JwtParser } from "./jwt-parser";
import { ClaimValidator } from "./claim-validator";
import { JwksKeyProvider } from "./jwks-key-provider";

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
	private readonly _jwtParser: JwtParser;
	private readonly _claimValidator: ClaimValidator;
	private readonly _keyProvider: JwksKeyProvider;

	constructor(config: OidcConfig) {
		this._config = config;
		this._allowedAlgorithms = new Set(
			config.allowedAlgorithms ?? ["RS256", "ES256"],
		);
		this._jwtParser = new JwtParser();
		this._claimValidator = new ClaimValidator(config);
		this._keyProvider = new JwksKeyProvider(config);
	}

	async verifyAndExtract(token: string): Promise<OidcClaims> {
		const { header, payload, message, signature } =
			this._jwtParser.parse<OidcClaims>(token);

		if (!this._allowedAlgorithms.has(header.alg)) {
			throw new Error(
				`JWT algorithm "${header.alg}" is not allowed. Must be one of: ${[...this._allowedAlgorithms].join(", ")}`,
			);
		}

		this._claimValidator.validate(payload);

		await this._verifySignature(message, signature, header);

		return payload;
	}

	private async _verifySignature(
		message: string,
		signature: Buffer,
		header: JwtHeader,
	): Promise<void> {
		const signingKey = await this._keyProvider.resolveSigningKey(header.kid);

		const algorithm = this._toNodeCryptoAlgorithm(header.alg);
		const verified = createVerify(algorithm)
			.update(message)
			.verify(signingKey, signature);

		if (!verified) {
			throw new Error("JWT signature verification failed");
		}
	}

	private _toNodeCryptoAlgorithm(alg: string): string {
		const mapped = ALGORITHM_MAP.get(alg);
		if (!mapped) {
			throw new Error(`Unsupported JWT algorithm: ${alg}`);
		}
		return mapped;
	}
}
