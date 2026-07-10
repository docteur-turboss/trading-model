import { REDIS_MODE } from "@trading-model/common/persistence/redis-constants";
import type { RedisConnectionConfig } from "@trading-model/common/config/redis-config";
import { createRedisClient } from "@trading-model/common/persistence/redis-connection-manager";

export function computePrefix(
	prefix: string,
	configOrUrl: string | RedisConnectionConfig
): string {
	if (typeof configOrUrl === "string") {
		return prefix;
	}
	return configOrUrl.mode === REDIS_MODE.CLUSTER
		? `{${prefix.replace(/[{}]/g, "").replace(/:$/, "")}}:`
		: prefix;
}

export { createRedisClient };
