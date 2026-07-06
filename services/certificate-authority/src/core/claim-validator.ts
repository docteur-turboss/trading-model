import type { OidcClaims, OidcConfig } from "./oidc-verifier";

export class ClaimValidator {
	private readonly _config: Pick<OidcConfig, "issuer" | "audience">;

	constructor(config: Pick<OidcConfig, "issuer" | "audience">) {
		this._config = config;
	}

	validate(payload: OidcClaims): void {
		this.assertIssuer(payload);
		this.assertAudience(payload);
		this.assertNotExpired(payload);
		this.assertNotBefore(payload);
	}

	assertIssuer(payload: OidcClaims): void {
		if (payload.iss !== this._config.issuer) {
			throw new Error(
				`JWT issuer mismatch: expected ${this._config.issuer}, got ${payload.iss}`
			);
		}
	}

	assertAudience(payload: OidcClaims): void {
		const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
		if (!audiences.includes(this._config.audience)) {
			throw new Error(
				`JWT audience mismatch: expected ${this._config.audience}`
			);
		}
	}

	assertNotExpired(payload: OidcClaims): void {
		if (payload.exp * 1000 < Date.now()) {
			throw new Error("JWT expired");
		}
	}

	assertNotBefore(payload: OidcClaims): void {
		if (payload.nbf && payload.nbf * 1000 > Date.now()) {
			throw new Error("JWT not yet valid (nbf)");
		}
	}
}
