import { CrlCache, type ICrlChecker } from "@trading-model/common/crl/crl-cache";
import type { RevokedCertificate } from "./types";

export interface Crl {
	entries: RevokedCertificate[];
	lastUpdate: Date;
	nextUpdate: Date;
}

export function createCrl(
	revoked: RevokedCertificate[],
	ttlMs: number = 7 * 24 * 60 * 60 * 1000
): Crl {
	return {
		entries: revoked,
		lastUpdate: new Date(),
		nextUpdate: new Date(Date.now() + ttlMs),
	};
}

/**
 * Wrap a Crl object as an ICrlChecker so it can be used interchangeably with CrlCache.
 * Delegates to CrlCache.fromCrlEntries to share the same revocation-check logic.
 */
export function createCrlChecker(crl: Crl): ICrlChecker {
	return CrlCache.fromCrlEntries(crl.entries);
}
