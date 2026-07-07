import Redis, { Cluster, type RedisOptions } from "ioredis";
import { logger } from "../config/logger";
import type {
	RedisConnectionConfig,
} from "../config/redis-config";
import type { HostPort } from "../domain/service-identity";
import { normalizeError } from "../utils/errors";
import { ConnectionManager } from "./connection-manager";

export type { RedisConnectionConfig } from "../config/redis-config";

const BASE_RETRY_STRATEGY = (times: number): number | null => {
	if (times > 20) {
		return null;
	}
	return Math.min(times * 200, 5000);
};

function attachErrorHandler(client: Redis | Cluster): void {
	client.on("error", (err: Error) => {
		logger.error("Redis connection error", {
			error: normalizeError(err),
		});
	});
}

function createFromUrl(url: string): Redis {
	const client = new Redis(url, {
		lazyConnect: true,
		retryStrategy: BASE_RETRY_STRATEGY,
		maxRetriesPerRequest: 5,
	});
	attachErrorHandler(client);
	return client;
}

function createSentinel(config: {
	sentinels: HostPort[];
	name: string;
	password?: string;
}): Redis {
	const client = new Redis({
		sentinels: config.sentinels,
		name: config.name,
		password: config.password,
		lazyConnect: true,
		retryStrategy: BASE_RETRY_STRATEGY,
		maxRetriesPerRequest: null,
	} as never);
	attachErrorHandler(client);
	return client;
}

function createClusterClient(nodes: HostPort[], password?: string): Cluster {
	const client = new Cluster(nodes as unknown as { host: string; port: number }[], {
		redisOptions: {
			lazyConnect: true,
			password,
			maxRetriesPerRequest: null,
		},
		clusterRetryStrategy: (times: number) => Math.min(times * 200, 5000),
	} as never);
	attachErrorHandler(client);
	return client;
}

function buildFromConfig(config: RedisConnectionConfig): Redis | Cluster {
	switch (config.mode) {
		case "single":
			return createFromUrl(config.url);
		case "sentinel":
			return createSentinel(config.config);
		case "cluster":
			return createClusterClient(config.config.nodes, config.config.password);
	}
}

export function createRedisClient(
	configOrUrl: string | RedisConnectionConfig
): Redis | Cluster {
	return typeof configOrUrl === "string"
		? createFromUrl(configOrUrl)
		: buildFromConfig(configOrUrl);
}

async function connectClient(client: Redis | Cluster): Promise<void> {
	await client.connect();
}

export class RedisConnectionManager extends ConnectionManager<Redis | Cluster> {
	constructor(configOrUrl: string | RedisConnectionConfig) {
		super(
			async () => {
				const client = createRedisClient(configOrUrl);
				await connectClient(client);
				return client;
			},
			async (client: Redis | Cluster) => {
				try {
					if ((client as Redis).status === "ready") {
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
}
