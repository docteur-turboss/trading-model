import type { Topic } from "@trading-model/common/domain/primitives";
import { ACL_DENY } from "./acl-constants";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getRedisClient } from "../../config/redis";

export async function loadFromRedis(topic: Topic): Promise<string[] | typeof ACL_DENY> {
	try {
		const redis = await getRedisClient();
		const aclKey = `${ENV.REDIS_PREFIX}acl:${topic}`;
		const services = await redis.smembers(aclKey);
		return services;
	} catch {
		logger.warn("ACL: Redis unavailable — deny access for topic", { topic });
		return ACL_DENY;
	}
}
