import {
	CrlCache,
	type ICrlChecker,
} from "@trading-model/common/crl/crl-cache";
import {
	DurationMs,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { RevokedCertificate } from "../keygen/types";

export interface Crl {
	entries: RevokedCertificate[];
	lastUpdate: UnixTimestamp;
	nextUpdate: UnixTimestamp;
}

export function createCrl(
	revoked: RevokedCertificate[],
	ttlMs: DurationMs = DurationMs.of(7 * 24 * 60 * 60 * 1000)
): Crl {
	return {
		entries: revoked,
		lastUpdate: UnixTimestamp.now(),
		nextUpdate: UnixTimestamp.add(UnixTimestamp.now(), ttlMs),
	};
}

/**
 * Wrap a Crl object as an ICrlChecker so it can be used interchangeably with CrlCache.
 * Delegates to CrlCache.fromCrlEntries to share the same revocation-check implementation pattern.
 */
export function createCrlChecker(crl: Crl): ICrlChecker {
	const oneYearAgo = UnixTimestamp.now() - 365 * 24 * 60 * 60 * 1000;
	const activeEntries = crl.entries.filter(
		(entry) => entry.revokedAt >= oneYearAgo
	);
	return CrlCache.fromCrlEntries(activeEntries);
}
