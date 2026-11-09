import { readFileSync } from "node:fs";
import type { URLString } from "@trading-model/primitives/primitives";
import Redis, { type RedisOptions } from "ioredis";
import { withErrorLogging } from "./redis-client-builder";
import type {
	RedisConnectionConfig,
	RedisSentinelConfig,
	RedisTlsConfig,
} from "./redis-config";

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
	return withErrorLogging(client);
}

function tlsOptions(tls: RedisTlsConfig): { ca: Buffer; servername: string } {
	return { ca: readFileSync(tls.caPath), servername: tls.servername };
}

export function createSentinel(
	config: RedisSentinelConfig,
	extraOptions?: Partial<RedisOptions>
): Redis {
	const client = new Redis({
		sentinels: config.sentinels,
		name: config.name,
		username: config.username,
		password: config.password,
		sentinelPassword: config.sentinelPassword,
		...(config.tls && {
			tls: tlsOptions(config.tls),
			enableTLSForSentinelMode: true,
			sentinelTLS: tlsOptions(config.tls),
		}),
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
	return withErrorLogging(client);
}

export function buildFromConfig(
	config: RedisConnectionConfig,
	extraOptions?: Partial<RedisOptions>
): Redis {
	return config.mode === "sentinel"
		? createSentinel(config.config, extraOptions)
		: createFromUrl(config.url, {
				...(config.tls && { tls: tlsOptions(config.tls) }),
				...extraOptions,
			});
}
