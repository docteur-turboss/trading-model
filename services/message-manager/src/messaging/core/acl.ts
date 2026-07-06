import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getRedisClient } from "../../config/redis";

const ACL_CACHE_TTL_MS = 300_000;
const ACL_CACHE_MAX_SIZE = 1000;
const ACL_CACHE = new Map<string, { services: string[]; expiresAt: number }>();
const ACL_LOADING = new Map<string, Promise<string[] | "deny">>();

function extractServiceName(req: {
	headers: Record<string, string | string[] | undefined>;
}): string | null {
	const cn = req.headers["x-service-name"];
	if (cn) {
		return Array.isArray(cn) ? cn[0] : cn;
	}
	return null;
}

function aclTtlWithJitter(): number {
	const jitter = ACL_CACHE_TTL_MS * 0.1 * (Math.random() * 2 - 1);
	return Math.round(ACL_CACHE_TTL_MS + jitter);
}

async function doLoadAllowedServices(
	topic: string
): Promise<string[] | "deny"> {
	try {
		const redis = await getRedisClient();
		const aclKey = `${ENV.REDIS_PREFIX}acl:${topic}`;
		const services = await redis.smembers(aclKey);
		return cacheAndReturn(topic, services);
	} catch {
		logger.warn("ACL: Redis unavailable — deny access for topic", { topic });
		return "deny";
	}
}

function cacheAndReturn(topic: string, services: string[]): string[] {
	evictIfNeeded();
	ACL_CACHE.set(topic, { services, expiresAt: Date.now() + aclTtlWithJitter() });
	return services;
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

async function getAllowedServices(topic: string): Promise<string[] | "deny"> {
	const cached = getFromCache(topic);
	if (cached) {
		return cached;
	}

	const inFlight = checkInFlight(topic);
	if (inFlight) {
		return await inFlight;
	}

	return loadAndCache(topic);
}

function getFromCache(topic: string): string[] | null {
	const now = Date.now();
	const cached = ACL_CACHE.get(topic);
	if (cached && now < cached.expiresAt) {
		return cached.services;
	}
	return null;
}

function checkInFlight(topic: string): Promise<string[] | "deny"> | null {
	const existing = ACL_LOADING.get(topic);
	if (!existing) {
		return null;
	}
	return existing.then(() => getFromCache(topic) ?? "deny");
}

async function loadAndCache(topic: string): Promise<string[] | "deny"> {
	const loadPromise = doLoadAllowedServices(topic);
	ACL_LOADING.set(topic, loadPromise);
	try {
		return await loadPromise;
	} finally {
		ACL_LOADING.delete(topic);
	}
}

export async function authorizeTopic(
	req: { headers: Record<string, string | string[] | undefined> },
	topic: string
): Promise<{ allowed: boolean; reason?: string }> {
	const serviceName = extractServiceName(req);
	if (!serviceName) {
		return { allowed: false, reason: "Missing x-service-name header" };
	}

	const allowedServices = await getAllowedServices(topic);

	if (allowedServices === "deny") {
		return {
			allowed: false,
			reason: "ACL service unavailable — access denied",
		};
	}

	if (allowedServices.length === 0) {
		return {
			allowed: false,
			reason: `No ACL configured for topic ${topic} — access denied`,
		};
	}

	if (allowedServices.includes(serviceName)) {
		return { allowed: true };
	}

	return {
		allowed: false,
		reason: `Service ${serviceName} not authorized for topic ${topic}`,
	};
}

export { extractServiceName };
