import { DurationMs } from "@trading-model/primitives/primitives";
import type Redis from "ioredis";
import type { Cluster, RedisOptions } from "ioredis";
import { ConnectionManager } from "./connection-manager";
import { RedisClientBuilder } from "./redis-client-builder";
import { buildFromConfig, createFromUrl } from "./redis-client-factories";
import type { RedisConnectionConfig } from "./redis-config";

export type { RedisConnectionConfig } from "./redis-config";

export function createRedisClient(
	configOrUrl: string | RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): Redis | Cluster {
	return typeof configOrUrl === "string"
		? createFromUrl(
				configOrUrl as import("@trading-model/primitives/primitives").URLString,
				extraOptions
			)
		: buildFromConfig(configOrUrl, extraOptions);
}

export function createRedisConnectionManager(
	configOrUrl: string | RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): ConnectionManager<Redis | Cluster> {
	return new ConnectionManager<Redis | Cluster>(
		async () => {
			const client = createRedisClient(configOrUrl, extraOptions);
			await RedisClientBuilder.connect(client);
			return client;
		},
		async (client: Redis | Cluster) => {
			await RedisClientBuilder.disconnect(client);
		},
		{
			maxRetries: 5,
			baseDelayMs: DurationMs.of(1000),
			maxDelayMs: DurationMs.of(30000),
		}
	);
}
