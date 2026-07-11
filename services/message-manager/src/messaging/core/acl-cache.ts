import {
	DurationMs,
	type Topic,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { ACL_DENY } from "./acl-constants";

const ACL_CACHE_TTL_MS = DurationMs.of(300_000);
const ACL_CACHE_MAX_SIZE = 1000;
const ACL_CACHE = new Map<
	Topic,
	{ services: string[]; expiresAt: UnixTimestamp }
>();
const ACL_LOADING = new Map<Topic, Promise<string[] | typeof ACL_DENY>>();

function aclTtlWithJitter(): DurationMs {
	const jitter = ACL_CACHE_TTL_MS * 0.1 * (Math.random() * 2 - 1);
	return DurationMs.of(Math.round(ACL_CACHE_TTL_MS + jitter));
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

function getFromCache(topic: Topic): string[] | null {
	const now = UnixTimestamp.now();
	const cached = ACL_CACHE.get(topic);
	if (cached && now < cached.expiresAt) {
		return cached.services;
	}
	return null;
}

function cacheAndReturn(topic: Topic, services: string[]): string[] {
	evictIfNeeded();
	ACL_CACHE.set(topic, {
		services,
		expiresAt: UnixTimestamp.of(Date.now() + aclTtlWithJitter()),
	});
	return services;
}

function peekInFlight(
	topic: Topic
): Promise<string[] | typeof ACL_DENY> | undefined {
	return ACL_LOADING.get(topic);
}

export async function getCachedOrLoad(
	topic: Topic,
	loader: (topic: Topic) => Promise<string[] | typeof ACL_DENY>
): Promise<string[] | typeof ACL_DENY> {
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
	topic: Topic
): Promise<string[] | typeof ACL_DENY | undefined> {
	const inFlight = peekInFlight(topic);
	if (!inFlight) {
		return;
	}
	await inFlight;
	const fromCache = getFromCache(topic);
	if (fromCache) {
		return fromCache;
	}
	return ACL_DENY;
}

async function _loadAndCache(
	topic: Topic,
	loader: (topic: Topic) => Promise<string[] | typeof ACL_DENY>
): Promise<string[] | typeof ACL_DENY> {
	const loadPromise = loader(topic);
	ACL_LOADING.set(topic, loadPromise);
	try {
		const result = await loadPromise;
		if (result !== ACL_DENY) {
			cacheAndReturn(topic, result);
		}
		return result;
	} finally {
		ACL_LOADING.delete(topic);
	}
}
