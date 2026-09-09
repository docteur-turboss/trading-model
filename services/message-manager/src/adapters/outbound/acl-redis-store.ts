import type { Topic } from "@trading-model/common/domain/primitives";
import { logger } from "../../config/logger";
import { getRedisClient } from "../../config/redis";
import { ENV } from "../../infrastructure/config/env";
import { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { ACL_DENY } from "../../messaging/core/acl-constants";

const AclKeys = new RedisKeyBuilder(ENV.REDIS_PREFIX);

export async function loadFromRedis(
	topic: Topic
): Promise<string[] | typeof ACL_DENY> {
	try {
		const redis = await getRedisClient();
		const aclKey = AclKeys.key("acl", topic);
		const services = await redis.smembers(aclKey);
		return services;
	} catch {
		logger.warn("ACL: Redis unavailable — deny access for topic", { topic });
		return ACL_DENY;
	}
}
