import Redis, { Cluster, type RedisOptions } from "ioredis";
import type {
	RedisClusterNodesConfig,
	RedisConnectionConfig,
	RedisSentinelConfig,
} from "../config/redis-config";
import type { URLString } from "../domain/primitives";
import type { HostPort } from "../domain/service-identity";
import { RedisClientBuilder } from "./redis-client-builder";
import { RedisMode } from "./redis-constants";

export const BASE_RETRY_STRATEGY = (times: number): number | null => {
	if (times > 20) {
		return null;
	}
	return Math.min(times * 200, 5000);
};

export const BASE_REDIS_OPTIONS: Partial<RedisOptions> = {
	lazyConnect: true,
	retryStrategy: BASE_RETRY_STRATEGY,
};

export function createFromUrl(
	url: URLString,
	extraOptions?: Partial<RedisOptions>
): Redis {
	const client = new Redis(url, {
		...BASE_REDIS_OPTIONS,
		maxRetriesPerRequest: 5,
		...extraOptions,
	});
	return new RedisClientBuilder(client).withErrorHandler().build() as Redis;
}

export function createSentinel(
	config: RedisSentinelConfig,
	extraOptions?: Partial<RedisOptions>
): Redis {
	const client = new Redis({
		sentinels: config.sentinels,
		name: config.name,
		password: config.password,
		...BASE_REDIS_OPTIONS,
		maxRetriesPerRequest: null,
		...extraOptions,
	} as never);
	return new RedisClientBuilder(client).withErrorHandler().build() as Redis;
}

export function createClusterClient(
	nodes: HostPort[],
	password?: string
): Cluster {
	const client = new Cluster(nodes, {
		redisOptions: {
			lazyConnect: true,
			password,
			maxRetriesPerRequest: null,
		},
		clusterRetryStrategy: (times: number) => Math.min(times * 200, 5000),
	} as never);
	return new RedisClientBuilder(client).withErrorHandler().build() as Cluster;
}

export const CLIENT_FACTORIES: Record<
	RedisMode,
	(
		config: RedisConnectionConfig,
		extraOptions?: Partial<RedisOptions>
	) => Redis | Cluster
> = {
	[RedisMode.SINGLE]: (config, extra) =>
		createFromUrl((config as { url: URLString }).url, extra),
	[RedisMode.SENTINEL]: (config, extra) =>
		createSentinel((config as { config: RedisSentinelConfig }).config, extra),
	[RedisMode.CLUSTER]: (config) =>
		createClusterClient(
			(config as { config: RedisClusterNodesConfig }).config.nodes,
			(config as { config: RedisClusterNodesConfig }).config.password
		),
};

export function buildFromConfig(
	config: RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): Redis | Cluster {
	const factory = CLIENT_FACTORIES[config.mode];
	if (!factory) {
		throw new Error(
			`Unknown Redis mode: ${(config as RedisConnectionConfig).mode}`
		);
	}
	return factory(config, extraOptions);
}
