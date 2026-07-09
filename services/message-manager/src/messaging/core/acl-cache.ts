const ACL_CACHE_TTL_MS = 300_000;
const ACL_CACHE_MAX_SIZE = 1000;
const ACL_CACHE = new Map<string, { services: string[]; expiresAt: number }>();
const ACL_LOADING = new Map<string, Promise<string[] | "deny">>();

function aclTtlWithJitter(): number {
	const jitter = ACL_CACHE_TTL_MS * 0.1 * (Math.random() * 2 - 1);
	return Math.round(ACL_CACHE_TTL_MS + jitter);
}

function evictIfNeeded(): void {
	if (ACL_CACHE.size < ACL_CACHE_MAX_SIZE) {
		return;
	}
	const evictCount = Math.ceil(ACL_CACHE_MAX_SIZE * 0.25);
	const keys = [...ACL_CACHE.keys()];
	for (let i = 0; i < evictCount && i < keys.length; i++) {
		ACL_CACHE.delete(keys[i]);
	}
}

function getFromCache(topic: string): string[] | null {
	const now = Date.now();
	const cached = ACL_CACHE.get(topic);
	if (cached && now < cached.expiresAt) {
		return cached.services;
	}
	return null;
}

function cacheAndReturn(topic: string, services: string[]): string[] {
	evictIfNeeded();
	ACL_CACHE.set(topic, {
		services,
		expiresAt: Date.now() + aclTtlWithJitter(),
	});
	return services;
}

function peekInFlight(topic: string): Promise<string[] | "deny"> | undefined {
	return ACL_LOADING.get(topic);
}

export async function getCachedOrLoad(
	topic: string,
	loader: (topic: string) => Promise<string[] | "deny">
): Promise<string[] | "deny"> {
	const cached = getFromCache(topic);
	if (cached) {
		return cached;
	}

	const fromInFlight = await _waitForInFlight(topic);
	if (fromInFlight !== undefined) {
		return fromInFlight;
	}

	return _loadAndCache(topic, loader);
}

async function _waitForInFlight(
	topic: string
): Promise<string[] | "deny" | undefined> {
	const inFlight = peekInFlight(topic);
	if (!inFlight) {
		return;
	}
	await inFlight;
	const fromCache = getFromCache(topic);
	if (fromCache) {
		return fromCache;
	}
	return "deny";
}

async function _loadAndCache(
	topic: string,
	loader: (topic: string) => Promise<string[] | "deny">
): Promise<string[] | "deny"> {
	const loadPromise = loader(topic);
	ACL_LOADING.set(topic, loadPromise);
	try {
		const result = await loadPromise;
		if (result !== "deny") {
			cacheAndReturn(topic, result);
		}
		return result;
	} finally {
		ACL_LOADING.delete(topic);
	}
}
