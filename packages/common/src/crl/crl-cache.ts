import type { SerialNumber } from "../domain/primitives";

/**
 * Shared interface for checking certificate revocation status.
 */
export interface ICrlChecker {
	isRevoked(serialNumber: SerialNumber): boolean;
}

/**
 * In-memory CRL cache that stores revoked certificate serial numbers.
 */
export class CrlCache implements ICrlChecker {
	private _revoked = new Set<string>();

	/**
	 * Mark a certificate as revoked in the local cache.
	 */
	addRevoked(serialNumber: SerialNumber): void {
		this._revoked.add(serialNumber.toUpperCase());
	}

	/**
	 * Returns true if the given serial number has been revoked.
	 */
	isRevoked(serialNumber: SerialNumber): boolean {
		return this._revoked.has(serialNumber.toUpperCase());
	}

	/**
	 * Returns true if the cache contains no revoked serials.
	 */
	get size(): number {
		return this._revoked.size;
	}

	/**
	 * Bulk-load revoked entries from a CRL or any list of objects with a serialNumber field.
	 */
	addRevokedFromEntries(
		entries: ReadonlyArray<{ serialNumber: SerialNumber }>
	): void {
		for (const entry of entries) {
			this.addRevoked(entry.serialNumber);
		}
	}

	/**
	 * Removes all entries from the local cache.
	 */
	clear(): void {
		this._revoked.clear();
	}

	/**
	 * Create a CrlCache pre-populated from a list of revoked entries.
	 */
	static fromCrlEntries(
		entries: ReadonlyArray<{ serialNumber: SerialNumber }>
	): CrlCache {
		const cache = new CrlCache();
		cache.addRevokedFromEntries(entries);
		return cache;
	}
}

/**
 * Singleton shared across all services in the same process.
 */
export const GLOBAL_CRL_CACHE = new CrlCache();
