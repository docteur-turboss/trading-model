import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis, { Cluster, type RedisOptions } from "ioredis";

export interface RedisSentinelConfig {
	sentinels: Array<{ host: string; port: number }>;
	name: string;
	password?: string;
}

export interface RedisClusterNodesConfig {
	nodes: Array<{ host: string; port: number }>;
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
	const isCluster =
		typeof configOrUrl !== "string" && configOrUrl.mode === "cluster";
	return isCluster
		? `{${prefix.replace(/[{}]/g, "").replace(/:$/, "")}}:`
		: prefix;
}

export function createRedisClient(
	configOrUrl: string | RedisConnectionConfig
): Redis | Cluster {
	if (typeof configOrUrl === "string") {
		const client = new Redis(configOrUrl, BASE_OPTIONS);
		client.on("error", (err: Error) => {
			logger.error("Redis connection error", { error: normalizeError(err) });
		});
		return client;
	}

	let client: Redis | Cluster;

	switch (configOrUrl.mode) {
		case "single":
			client = new Redis(configOrUrl.url, BASE_OPTIONS);
			break;

		case "sentinel": {
			const { sentinels, name, password } = configOrUrl.config;
			client = new Redis({
				...BASE_OPTIONS,
				sentinels,
				name,
				password,
			});
			break;
		}

		case "cluster": {
			const { nodes, password } = configOrUrl.config;
			client = new Cluster(nodes, {
				redisOptions: {
					...BASE_OPTIONS,
					password,
				},
				clusterRetryStrategy: (times: number) => {
					return Math.min(times * 200, 5000);
				},
			});
			break;
		}

		default:
			throw new Error(
				`Unknown Redis connection mode: ${(configOrUrl as RedisConnectionConfig).mode}`
			);
	}

	client.on("error", (err: Error) => {
		logger.error("Redis connection error", { error: normalizeError(err) });
	});

	return client;
}
