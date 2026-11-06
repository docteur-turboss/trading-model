import type { URLString } from "@trading-model/primitives/primitives";
import Redis, { Cluster, type RedisOptions } from "ioredis";
import { RedisClientBuilder } from "./redis-client-builder";
import type {
	RedisClusterNodesConfig,
	RedisConnectionConfig,
	RedisNodeAddress,
	RedisSentinelConfig,
} from "./redis-config";
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
		// Follow +switch-master: without it a client left on a frozen or
		// half-dead master keeps waiting on it after Sentinel has failed over.
		failoverDetector: true,
		...extraOptions,
	} as never);
	// shortcut: works around an ioredis 6.0.0 race through its private
	// `connector`, drop it once a release retires the detector itself.
	// The failover detector of a closed connection outlives it: when its
	// +switch-master arrives during the reconnect, it aborts that reconnect
	// ("Connection is closed.") and leaves the client in `end` for good.
	// Retiring it on close is safe: each new connection subscribes a new one.
	client.on("close", () => {
		(
			client as unknown as {
				connector?: { failoverDetector?: { cleanup(): void } | null };
			}
		).connector?.failoverDetector?.cleanup();
	});
	return new RedisClientBuilder(client).withErrorHandler().build() as Redis;
}

export function createClusterClient(
	nodes: RedisNodeAddress[],
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
