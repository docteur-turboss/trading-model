import Redis, { Cluster, type RedisOptions } from "ioredis";
import { logger } from "../config/logger";
import type { RedisConnectionConfig } from "../config/redis-config";
import type { HostPort } from "../domain/service-identity";
import { normalizeError } from "../utils/errors";
import { ConnectionManager } from "./connection-manager";
import { REDIS_MODE, REDIS_STATUS } from "./redis-constants";

export type { RedisConnectionConfig } from "../config/redis-config";

const BASE_RETRY_STRATEGY = (times: number): number | null => {
	if (times > 20) {
		return null;
	}
	return Math.min(times * 200, 5000);
};

const BASE_REDIS_OPTIONS: Partial<RedisOptions> = {
	lazyConnect: true,
	retryStrategy: BASE_RETRY_STRATEGY,
};

function attachErrorHandler(client: Redis | Cluster): void {
	client.on("error", (err: Error) => {
		logger.error("Redis connection error", {
			error: normalizeError(err),
		});
	});
}

function createFromUrl(
	url: string,
	extraOptions?: Partial<RedisOptions>
): Redis {
	const client = new Redis(url, {
		...BASE_REDIS_OPTIONS,
		maxRetriesPerRequest: 5,
		...extraOptions,
	});
	attachErrorHandler(client);
	return client;
}

function createSentinel(
	config: {
		sentinels: HostPort[];
		name: string;
		password?: string;
	},
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
	attachErrorHandler(client);
	return client;
}

function createClusterClient(nodes: HostPort[], password?: string): Cluster {
	const client = new Cluster(
		nodes as { host: string; port: number }[],
		{
			redisOptions: {
				lazyConnect: true,
				password,
				maxRetriesPerRequest: null,
			},
			clusterRetryStrategy: (times: number) => Math.min(times * 200, 5000),
		} as never
	);
	attachErrorHandler(client);
	return client;
}

function buildFromConfig(
	config: RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): Redis | Cluster {
	switch (config.mode) {
		case REDIS_MODE.SINGLE:
			return createFromUrl(config.url, extraOptions);
		case REDIS_MODE.SENTINEL:
			return createSentinel(config.config, extraOptions);
		case REDIS_MODE.CLUSTER:
			return createClusterClient(config.config.nodes, config.config.password);
		default:
			throw new Error(
				`Unknown Redis mode: ${(config as RedisConnectionConfig).mode}`
			);
	}
}

export function createRedisClient(
	configOrUrl: string | RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): Redis | Cluster {
	return typeof configOrUrl === "string"
		? createFromUrl(configOrUrl, extraOptions)
		: buildFromConfig(configOrUrl, extraOptions);
}

async function connectClient(client: Redis | Cluster): Promise<void> {
	await client.connect();
}

export function createRedisConnectionManager(
	configOrUrl: string | RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): ConnectionManager<Redis | Cluster> {
	return new ConnectionManager<Redis | Cluster>(
		async () => {
			const client = createRedisClient(configOrUrl, extraOptions);
			await connectClient(client);
			return client;
		},
		async (client: Redis | Cluster) => {
			try {
				if ((client as Redis).status === REDIS_STATUS.READY) {
					await (client as Redis).quit();
				} else {
					client.disconnect();
				}
			} catch {
				client.disconnect();
			}
		},
		{ maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 30000 }
	);
}
