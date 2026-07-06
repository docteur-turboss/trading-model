import type { HostPort } from "@trading-model/common/domain/service-identity";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis, { Cluster, type RedisOptions } from "ioredis";

export interface RedisSentinelConfig {
	sentinels: HostPort[];
	name: string;
	password?: string;
}

export interface RedisClusterNodesConfig {
	nodes: HostPort[];
	password?: string;
}

export type RedisConnectionConfig =
	| { mode: "single"; url: string }
	| { mode: "sentinel"; config: RedisSentinelConfig }
	| { mode: "cluster"; config: RedisClusterNodesConfig };

const BASE_OPTIONS: RedisOptions = {
	retryStrategy: (times: number) => {
		return Math.min(times * 200, 5000);
	},
	maxRetriesPerRequest: 5,
	lazyConnect: true,
};

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

interface RedisClientCreator {
	create(config: RedisConnectionConfig & { mode: string }): Redis | Cluster;
}

const REDIS_CLIENT_CREATORS: Record<string, RedisClientCreator> = {
	single: {
		create: (config) => new Redis((config as RedisConnectionConfig & { mode: "single" }).url, BASE_OPTIONS),
	},
	sentinel: {
		create: (config) => {
			const { sentinels, name, password } = (config as RedisConnectionConfig & { mode: "sentinel" }).config;
			return new Redis({ ...BASE_OPTIONS, sentinels, name, password });
		},
	},
	cluster: {
		create: (config) => {
			const { nodes, password } = (config as RedisConnectionConfig & { mode: "cluster" }).config;
			return new Cluster(nodes, {
				redisOptions: { ...BASE_OPTIONS, password },
				clusterRetryStrategy: (times: number) => Math.min(times * 200, 5000),
			});
		},
	},
};

function attachErrorHandler(client: Redis | Cluster): void {
	client.on("error", (err: Error) => {
		logger.error("Redis connection error", { error: normalizeError(err) });
	});
}

function _createFromUrl(configOrUrl: string): Redis | Cluster {
	const client = new Redis(configOrUrl, BASE_OPTIONS);
	attachErrorHandler(client);
	return client;
}

function _createFromConfig(config: RedisConnectionConfig): Redis | Cluster {
	const creator = REDIS_CLIENT_CREATORS[config.mode];
	if (!creator) {
		throw new Error(`Unknown Redis connection mode: ${(config as RedisConnectionConfig).mode}`);
	}
	const client = creator.create(config);
	attachErrorHandler(client);
	return client;
}

export function createRedisClient(
	configOrUrl: string | RedisConnectionConfig
): Redis | Cluster {
	return typeof configOrUrl === "string"
		? _createFromUrl(configOrUrl)
		: _createFromConfig(configOrUrl);
}
