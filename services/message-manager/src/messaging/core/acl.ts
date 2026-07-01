import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getRedisClient } from '../../config/redis';

const ACL_CACHE_TTL_MS = 300_000;
const ACL_CACHE_MAX_SIZE = 1000;
const aclCache = new Map<string, { services: string[]; expiresAt: number }>();
const aclLoading = new Map<string, Promise<void>>();

function extractServiceName(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const cn = req.headers['x-service-name'];
  if (cn) return Array.isArray(cn) ? cn[0] : cn;
  return null;
}

function aclTtlWithJitter(): number {
  const jitter = ACL_CACHE_TTL_MS * 0.1 * (Math.random() * 2 - 1);
  return Math.round(ACL_CACHE_TTL_MS + jitter);
}

async function doLoadAllowedServices(topic: string): Promise<string[] | 'deny'> {
  const now = Date.now();
  try {
    const redis = await getRedisClient();
    const aclKey = `${env.REDIS_PREFIX}acl:${topic}`;
    const services = await redis.smembers(aclKey);
    if (aclCache.size >= ACL_CACHE_MAX_SIZE) {
      const evictCount = Math.ceil(ACL_CACHE_MAX_SIZE * 0.25);
      const keys = [...aclCache.keys()];
      for (let i = 0; i < evictCount && i < keys.length; i++) {
        aclCache.delete(keys[i]);
      }
    }
    aclCache.set(topic, { services, expiresAt: now + aclTtlWithJitter() });
    return services;
  } catch {
    logger.warn('ACL: Redis unavailable — deny access for topic', { topic });
    return 'deny';
  }
}

async function getAllowedServices(topic: string): Promise<string[] | 'deny'> {
  const now = Date.now();
  const cached = aclCache.get(topic);
  if (cached && now < cached.expiresAt) return cached.services;

  const inFlight = aclLoading.get(topic);
  if (inFlight) {
    await inFlight;
    const refreshed = aclCache.get(topic);
    if (refreshed && now < refreshed.expiresAt) return refreshed.services;
  }

  const loadPromise = doLoadAllowedServices(topic);
  aclLoading.set(topic, loadPromise);
  try {
    return await loadPromise;
  } finally {
    aclLoading.delete(topic);
  }
}

export async function authorizeTopic(
  req: { headers: Record<string, string | string[] | undefined> },
  topic: string
): Promise<{ allowed: boolean; reason?: string }> {
  const serviceName = extractServiceName(req);
  if (!serviceName) {
    return { allowed: false, reason: 'Missing x-service-name header' };
  }

  const allowedServices = await getAllowedServices(topic);

  if (allowedServices === 'deny') {
    return { allowed: false, reason: 'ACL service unavailable — access denied' };
  }

  if (allowedServices.length === 0) {
    return { allowed: false, reason: `No ACL configured for topic ${topic} — access denied` };
  }

  if (allowedServices.includes(serviceName)) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Service ${serviceName} not authorized for topic ${topic}` };
}

export { extractServiceName };
