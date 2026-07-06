/**
 * In-memory CRL cache that stores revoked certificate serial numbers.
 */
export class CrlCache {
	private _revoked = new Set<string>();

	/**
	 * Mark a certificate as revoked in the local cache.
	 */
	addRevoked(serialNumber: string): void {
		this._revoked.add(serialNumber.toUpperCase());
	}

	/**
	 * Returns true if the given serial number has been revoked.
	 */
	isRevoked(serialNumber: string): boolean {
		return this._revoked.has(serialNumber.toUpperCase());
	}

	/**
	 * Returns true if the cache contains no revoked serials.
	 */
	get size(): number {
		return this._revoked.size;
	}

	/**
	 * Removes all entries from the local cache.
	 */
	clear(): void {
		this._revoked.clear();
	}
}

/**
 * Singleton shared across all services in the same process.
 */
export const GLOBAL_CRL_CACHE = new CrlCache();
