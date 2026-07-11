import type { RedisConnectionConfig } from "@trading-model/common/config/redis-config";
import { createRedisClient } from "@trading-model/common/persistence/redis-connection-manager";
import { RedisMode } from "@trading-model/common/persistence/redis-constants";

export function computePrefix(
	prefix: string,
	configOrUrl: string | RedisConnectionConfig
): string {
	if (typeof configOrUrl === "string") {
		return prefix;
	}
	return configOrUrl.mode === RedisMode.CLUSTER
		? `{${prefix.replace(/[{}]/g, "").replace(/:$/, "")}}:`
		: prefix;
}

export { createRedisClient };
