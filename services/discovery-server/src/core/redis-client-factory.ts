import { createRedisClient } from "@trading-model/common/persistence/redis-connection-manager";
import type {
	RedisConnectionConfig,
} from "@trading-model/common/config/redis-config";

export function computePrefix(
	prefix: string,
	configOrUrl: string | RedisConnectionConfig
): string {
	if (typeof configOrUrl === "string") {
		return prefix;
	}
	return configOrUrl.mode === "cluster"
		? `{${prefix.replace(/[{}]/g, "").replace(/:$/, "")}}:`
		: prefix;
}

export { createRedisClient };
