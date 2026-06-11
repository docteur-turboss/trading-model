export interface CacheEntry {
  key: string;
  service: string;
  expiration: string;
  size: string;
  lastAccess: string;
  status?: string;
}

export interface CacheStats {
  hitRate: number;
  activeEntries: number;
}
