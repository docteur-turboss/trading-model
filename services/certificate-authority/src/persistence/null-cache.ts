import type { RedisCache } from "./redis-cache.types";

export const NULL_CACHE: RedisCache = {
	disconnect: async () => {},
	isAvailable: () => false,
	get: async () => null,
	set: async () => {},
	delete: async () => {},
	clear: async () => {},
	makeKey: (parts: string[]) => `ca-cache:${parts.join(":")}`,
};
