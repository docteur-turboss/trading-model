import type Redis from "ioredis";
import type { RedisOptions } from "ioredis";
import { buildFromConfig } from "./redis-client-factories";
import type { RedisConnectionConfig } from "./redis-config";

export type { RedisConnectionConfig } from "./redis-config";

export function createRedisClient(
	config: RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): Redis {
	return buildFromConfig(config, extraOptions);
}
