import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getRedisClient } from "../../config/redis";

export async function loadFromRedis(topic: string): Promise<string[] | "deny"> {
	try {
		const redis = await getRedisClient();
		const aclKey = `${ENV.REDIS_PREFIX}acl:${topic}`;
		const services = await redis.smembers(aclKey);
		return services;
	} catch {
		logger.warn("ACL: Redis unavailable — deny access for topic", { topic });
		return "deny";
	}
}
