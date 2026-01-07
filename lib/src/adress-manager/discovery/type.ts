import { ServiceInstance } from "../client/type";

/**
 * CacheEntry
 *
 * Represents an internal cache entry for a service instance.
 *
 * Responsibilities:
 * - Store the service instance
 * - Track expiration time
 *
 * Constraints:
 * - Strictly private to ServiceCache
 * - Should not be used directly outside the caching layer
 *
 * @internal
 */
export interface CacheEntry {
  /**
   * The cached service instance.
   */
  instance: ServiceInstance;

  /**
   * Timestamp (in milliseconds) at which this cache entry expires.
   */
  expiresAt: number;
}