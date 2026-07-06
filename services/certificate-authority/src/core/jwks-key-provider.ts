import { type KeyObject } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";

import type { OidcConfig } from "./oidc-verifier";
import { JwkCache } from "./jwk-cache";
import { JwkFetcher } from "./jwk-fetcher";

export class JwksKeyProvider {
	private readonly _cache = new JwkCache();
	private readonly _fetcher = new JwkFetcher();
	private readonly _config: Pick<OidcConfig, "jwksUri">;

	constructor(config: Pick<OidcConfig, "jwksUri">) {
		this._config = config;
	}

	async resolveSigningKey(kid?: string): Promise<KeyObject> {
		await this._refreshKeys();
		if (kid) {
			const key = this._cache.lookupByKid(kid);
			if (key) return key;
		}
		const singleKey = this._cache.lookupSingleKey();
		if (singleKey) return singleKey;
		throw new Error(`Signing key not found (kid: ${kid ?? "none"})`);
	}

	private async _refreshKeys(): Promise<void> {
		if (!this._cache.shouldRefresh()) {
			return;
		}
		if (!this._config.jwksUri) {
			throw new Error("JWKS URI not configured");
		}
		try {
			await this._fetchAndCacheKeys();
		} catch (err) {
			if (this._cache.hasKeys()) {
				logger.warn("JWKS refresh failed, using cached keys", {
					context: { err },
				});
				return;
			}
			throw err;
		}
	}

	private async _fetchAndCacheKeys(): Promise<void> {
		const parsed = await this._fetcher.fetch(this._config.jwksUri);
		this._cache.update(parsed);
		logger.info("JWKS keys refreshed", {
			context: { count: this._cache.size() },
		});
	}
}
