import type { URLString } from "@trading-model/primitives/primitives";
import type Redis from "ioredis";
import type { RedisOptions } from "ioredis";
import { buildFromConfig, createFromUrl } from "./redis-client-factories";
import type { RedisConnectionConfig } from "./redis-config";

export type { RedisConnectionConfig } from "./redis-config";

export function createRedisClient(
	configOrUrl: string | RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): Redis {
	return typeof configOrUrl === "string"
		? createFromUrl(configOrUrl as URLString, extraOptions)
		: buildFromConfig(configOrUrl, extraOptions);
}
