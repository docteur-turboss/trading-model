import type { CacheEntryList } from "../types/dtos";
import { request } from "./_request";

export const cacheApi = {
	getCacheEntries: () => request<CacheEntryList>("GET", "/gateway/cache"),
	invalidateCache: (key?: string) =>
		key
			? request<void>("DELETE", `/gateway/cache/${key}`)
			: request<void>("DELETE", "/gateway/cache"),
};
