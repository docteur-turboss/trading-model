import Redis, { Cluster, type RedisOptions } from "ioredis";

import { ENV } from "./env";
import { logger } from "./logger";

export function redisRetryDelay(retries: number): number | null {
	const maxAttempts = ENV.REDIS_MAX_RECONNECT_ATTEMPTS;
	if (maxAttempts === 0 || (maxAttempts > 0 && retries >= maxAttempts)) {
		if (retries > 0 || maxAttempts === 0) {
			logger.error(
				`Redis: max reconnection attempts (${maxAttempts}) reached, giving up`
			);
		}
		return null;
	}
	const baseDelay = Math.min(1000 * 2 ** (retries - 1), 30000);
	const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
	const delay = Math.max(100, Math.round(baseDelay + jitter));
	if (retries > 1) {
		logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${retries})`);
	}
	return delay;
}

function buildRedisOptions(): Record<string, unknown> {
	const url = ENV.REDIS_URL;
	const tls = ENV.REDIS_TLS_ENABLED
		? { tls: { rejectUnauthorized: true } }
		: {};
	const opts: Record<string, unknown> = {
		retryStrategy: (retries: number) => redisRetryDelay(retries),
		lazyConnect: true,
		maxRetriesPerRequest: null,
		enableReadyCheck: true,
		...tls,
	};
	if (url) {
		return opts;
	}
	return {
		...opts,
		host: ENV.REDIS_HOST,
		port: ENV.REDIS_PORT,
		password: ENV.REDIS_PASSWORD || undefined,
		db: ENV.REDIS_DB,
	};
}

function buildSentinelClient(): Redis {
	let sentinelNodes: Array<{ host: string; port: number }>;
	try {
		sentinelNodes = ENV.REDIS_SENTINEL_NODES
			? (JSON.parse(ENV.REDIS_SENTINEL_NODES) as Array<{
					host: string;
					port: number;
				}>)
			: [{ host: ENV.REDIS_HOST, port: ENV.REDIS_PORT }];
	} catch (cause) {
		const err = new Error(
			`Invalid REDIS_SENTINEL_NODES JSON: ${(cause as Error).message}`
		);
		(err as { cause?: unknown }).cause = cause;
		throw err;
	}
	const sentinelOpts: Record<string, unknown> = {
		sentinels: sentinelNodes,
		name: ENV.REDIS_SENTINEL_MASTER_NAME,
		password: ENV.REDIS_SENTINEL_PASSWORD || undefined,
		db: ENV.REDIS_DB,
		retryStrategy: (retries: number) => redisRetryDelay(retries),
		lazyConnect: true,
		maxRetriesPerRequest: null,
		enableReadyCheck: true,
	};
	if (ENV.REDIS_TLS_ENABLED) {
		sentinelOpts.tls = { rejectUnauthorized: true };
	}
	return new Redis(sentinelOpts as RedisOptions) as unknown as Redis;
}

function parseClusterNodes(): Array<{ host: string; port: number }> {
	try {
		return JSON.parse(ENV.REDIS_CLUSTER_NODES!) as Array<{
			host: string;
			port: number;
		}>;
	} catch (cause) {
		const err = new Error(
			`Invalid REDIS_CLUSTER_NODES JSON: ${(cause as Error).message}`
		);
		(err as { cause?: unknown }).cause = cause;
		throw err;
	}
}

function clusterRetryStrategy(retries: number): number | null {
	const maxAttempts = ENV.REDIS_MAX_RECONNECT_ATTEMPTS;
	if (maxAttempts === 0 || (maxAttempts > 0 && retries >= maxAttempts)) {
		if (retries > 0 || maxAttempts === 0) {
			logger.error(
				`Redis Cluster: max reconnection attempts (${maxAttempts}) reached`
			);
		}
		return null;
	}
	return redisRetryDelay(retries);
}

function buildClusterClient(): Redis {
	const clusterNodes = parseClusterNodes();
	return new Cluster(clusterNodes, {
		redisOptions: {
			password: ENV.REDIS_PASSWORD ?? undefined,
			lazyConnect: true,
			maxRetriesPerRequest: null,
			enableReadyCheck: true,
		},
		clusterRetryStrategy,
		scaleReads: "slave",
		enableAutoPipelining: true,
	}) as unknown as Redis;
}

function buildStandaloneClient(): Redis {
	const options = buildRedisOptions();
	return new Redis(options as RedisOptions);
}

export function buildRedisInstance(): Redis {
	if (ENV.REDIS_SENTINEL_MASTER_NAME) {
		return buildSentinelClient();
	}
	if (ENV.REDIS_CLUSTER_NODES) {
		return buildClusterClient();
	}
	return buildStandaloneClient();
}
