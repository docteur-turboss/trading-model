import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import Redis, { Cluster, type RedisOptions } from "ioredis";

import { ENV } from "./env";
import { logger } from "./logger";

export function redisRetryDelay(retries: number): number | null {
	if (isMaxAttemptsReached(retries)) {
		logExhausted(retries);
		return null;
	}
	const delay = computeDelay(retries);
	if (retries > 1) {
		logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${retries})`);
	}
	return delay;
}

function isMaxAttemptsReached(retries: number): boolean {
	const maxAttempts = ENV.REDIS_MAX_RECONNECT_ATTEMPTS;
	return maxAttempts === 0 || (maxAttempts > 0 && retries >= maxAttempts);
}

function logExhausted(retries: number): void {
	if (retries > 0 || ENV.REDIS_MAX_RECONNECT_ATTEMPTS === 0) {
		logger.error(
			`Redis: max reconnection attempts (${ENV.REDIS_MAX_RECONNECT_ATTEMPTS}) reached, giving up`
		);
	}
}

function computeDelay(retries: number): number {
	const baseDelay = computeExponentialBackoff(retries - 1, {
		baseDelayMs: 1000,
		maxDelayMs: 30_000,
	});
	const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
	return Math.max(100, Math.round(baseDelay + jitter));
}

function baseRedisOptions(): Record<string, unknown> {
	const tls = ENV.REDIS_TLS_ENABLED
		? { tls: { rejectUnauthorized: true } }
		: {};
	return {
		retryStrategy: (retries: number) => redisRetryDelay(retries),
		lazyConnect: true,
		maxRetriesPerRequest: null,
		enableReadyCheck: true,
		...tls,
	};
}

function buildSentinelClient(): Redis {
	const sentinelNodes = parseSentinelNodes();
	const sentinelOpts = buildSentinelOptions(sentinelNodes);
	return new Redis(sentinelOpts as RedisOptions) as unknown as Redis;
}

function parseSentinelNodes(): { host: string; port: number }[] {
	try {
		return JSON.parse(ENV.REDIS_SENTINEL_NODES!) as { host: string; port: number }[];
	} catch (cause) {
		throw wrapParseError(cause as Error, "REDIS_SENTINEL_NODES");
	}
}

function wrapParseError(cause: Error, name: string): never {
	const err = new Error(`Invalid ${name} JSON: ${cause.message}`);
	(err as { cause?: unknown }).cause = cause;
	throw err;
}

function buildSentinelOptions(
	sentinelNodes: { host: string; port: number }[]
): Record<string, unknown> {
	const sentinelOpts: Record<string, unknown> = {
		sentinels: sentinelNodes,
		name: ENV.REDIS_SENTINEL_MASTER_NAME,
		password: ENV.REDIS_SENTINEL_PASSWORD || undefined,
		retryStrategy: (retries: number) => redisRetryDelay(retries),
		lazyConnect: true,
		maxRetriesPerRequest: null,
		enableReadyCheck: true,
	};
	if (ENV.REDIS_TLS_ENABLED) {
		sentinelOpts.tls = { rejectUnauthorized: true };
	}
	return sentinelOpts;
}

function parseClusterNodes(): { host: string; port: number }[] {
	try {
		return JSON.parse(ENV.REDIS_CLUSTER_NODES!) as { host: string; port: number }[];
	} catch (cause) {
		throw wrapParseError(cause as Error, "REDIS_CLUSTER_NODES");
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
	return new Cluster(clusterNodes, clusterOptions()) as unknown as Redis;
}

function clusterOptions(): Record<string, unknown> {
	return {
		redisOptions: {
			password: ENV.REDIS_PASSWORD ?? undefined,
			lazyConnect: true,
			maxRetriesPerRequest: null,
			enableReadyCheck: true,
		},
		clusterRetryStrategy,
		scaleReads: "slave",
		enableAutoPipelining: true,
	};
}

function buildStandaloneClient(): Redis {
	return new Redis(ENV.REDIS_URL!, baseRedisOptions() as RedisOptions);
}

export function createRedisClient(): Redis {
	return buildRedisInstance();
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
