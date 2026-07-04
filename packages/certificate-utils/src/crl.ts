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

export function isRevoked(serialNumber: string, crl: Crl): boolean {
	return crl.entries.some(
		(entry) =>
			entry.serialNumber === serialNumber && !isExpiredRevocation(entry)
	);
}

function isExpiredRevocation(entry: RevokedCertificate): boolean {
	const maxAge = 365 * 24 * 60 * 60 * 1000;
	return Date.now() - entry.revokedAt.getTime() > maxAge;
}
