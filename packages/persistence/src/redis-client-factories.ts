import { readFileSync } from "node:fs";
import type { URLString } from "@trading-model/primitives/primitives";
import Redis, { type RedisOptions } from "ioredis";
import { withErrorLogging } from "./redis-client-builder";
import type {
	RedisConnectionConfig,
	RedisSentinelConfig,
	RedisTlsConfig,
} from "./redis-config";

/** Reconnects forever (a client in `end` never comes back: issue #1740), backoff capped at 5 s. */
export const BASE_RETRY_STRATEGY = (times: number): number =>
	Math.min(times * 200, 5000);

/** A command fails after this long when Redis is unreachable. It bounds the caller's wait only: ioredis keeps a timed-out command in its offline queue and writes it on reconnection (see `JOURNAL_WRITE_OPTIONS` for writes that must not be late). */
export const REDIS_COMMAND_TIMEOUT_MS = 2000;

export const BASE_REDIS_OPTIONS: Partial<RedisOptions> = {
	lazyConnect: true,
	retryStrategy: BASE_RETRY_STRATEGY,
	connectTimeout: REDIS_COMMAND_TIMEOUT_MS,
	commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
	maxRetriesPerRequest: 5,
};

/** Sentinel clients retry every second at most (never give up): a restarted Redis is back within seconds (issue #1112). */
export const SENTINEL_RETRY_STRATEGY = (times: number): number =>
	Math.min(times * 200, 1000);

export function createFromUrl(
	url: URLString,
	extraOptions?: Partial<RedisOptions>
): Redis {
	const client = new Redis(url, {
		...BASE_REDIS_OPTIONS,
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
			// Sentinel announces the clear port until `required` (ADR-0047): follow the master on TLS.
			natMap: (key: string) => {
				const [host, port] = key.split(":");
				return port === "6379" ? { host, port: 6380 } : undefined;
			},
		}),
		...BASE_REDIS_OPTIONS,
		retryStrategy: SENTINEL_RETRY_STRATEGY,
		// Follow +switch-master: without it a client left on a frozen or
		// half-dead master keeps waiting on it after Sentinel has failed over.
		failoverDetector: true,
		...extraOptions,
	} as never); // natMap returns undefined where ioredis types want null; behaviour kept
	// shortcut: works around an ioredis 6.0.0 race through its private
	// `connector`, drop it once a release retires the detector itself.
	// The failover detector of a closed connection outlives it: when its
	// +switch-master arrives during the reconnect, it aborts that reconnect
	// ("Connection is closed.") and leaves the client in `end` for good.
	// Retiring it on close is safe: each new connection subscribes a new one.
	client.on("close", () => {
		// as unknown as: ioredis typings omit the sentinel event API
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
