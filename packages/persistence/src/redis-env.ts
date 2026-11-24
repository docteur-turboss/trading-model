import { isIP } from "node:net";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import {
	Hostname,
	IPAddress,
	Port,
	URLString,
} from "@trading-model/primitives/primitives";
import { z } from "zod";
import type {
	RedisConnectionConfig,
	RedisNodeAddress,
	RedisTlsConfig,
} from "./redis-config";

/**
 * How a service reaches Redis. With REDIS_SENTINELS set it goes through the
 * sentinels (HA); REDIS_URL is the single-node fallback for dev and tests.
 * Turned into a connection by `redisConnectionFromEnv`.
 */
export const RedisEnvSchema = z.object({
	/** Single-node connection, used when no sentinel is configured. */
	REDIS_URL: z.string().optional(),
	/** Comma-separated sentinels, `host:port` with an IP or DNS name (`[ipv6]:port`). */
	REDIS_SENTINELS: z.string().optional(),
	REDIS_SENTINEL_MASTER_NAME: z.string().optional(),
	/** ACL user of the service (K8s: one per service, limited to its key prefix). */
	REDIS_USERNAME: z.string().optional(),
	REDIS_PASSWORD: z.string().optional(),
	/** Password of the sentinels, when they require one. */
	REDIS_SENTINEL_PASSWORD: z.string().optional(),
	/** `optional` (default): clear connections. `required`: TLS to nodes and sentinels, REDIS_TLS_CA needed (ADR-0047, issue #930). */
	REDIS_TLS_MODE: z.enum(["optional", "required"]).optional(),
	/** Path of the PEM CA of the Redis server certificates. */
	REDIS_TLS_CA: z.string().optional(),
	/** Name the server certificate carries (default `redis`). */
	REDIS_TLS_SERVERNAME: z.string().optional(),
	/** Replicas that must hold a bus write before it is accepted (`WAIT`, ADR-0048): 0 on one node, 1+ with Sentinel. */
	JOURNAL_MIN_REPLICAS: z.coerce.number().int().min(0).default(0),
});

/** Redis settings of a bus service, plus its transport (ADR-0073, read by `busJournalFromEnv`). */
export const BusEnvSchema = RedisEnvSchema.extend({
	/** `library`: Redis Streams in process; `http`: through message-manager; unset: library when Redis is set (N-1 rule). */
	BUS_TRANSPORT: z.enum(["library", "http"]).optional(),
});

const DEFAULT_SENTINEL_MASTER_NAME = "mymaster";

/** Environment variables a service reads to reach Redis. */
export type RedisEnv = Omit<
	z.input<typeof RedisEnvSchema>,
	"JOURNAL_MIN_REPLICAS"
>;

/** Parses `host:port,host:port`; throws a RangeError on a malformed entry. */
export function parseRedisNodes(list: string): RedisNodeAddress[] {
	return parseCommaSeparated(list).map(_parseNode);
}

/**
 * The connection a service should open: through the sentinels when
 * REDIS_SENTINELS is set, to REDIS_URL otherwise, none when neither is.
 */
export function redisConnectionFromEnv(
	env: RedisEnv
): RedisConnectionConfig | undefined {
	const tls = _tlsFromEnv(env);
	const sentinels = env.REDIS_SENTINELS?.trim();
	if (sentinels) {
		return {
			mode: "sentinel",
			config: {
				sentinels: parseRedisNodes(sentinels),
				name: env.REDIS_SENTINEL_MASTER_NAME || DEFAULT_SENTINEL_MASTER_NAME,
				username: env.REDIS_USERNAME || undefined,
				password: env.REDIS_PASSWORD || undefined,
				sentinelPassword: env.REDIS_SENTINEL_PASSWORD || undefined,
				tls,
			},
		};
	}
	const url = env.REDIS_URL?.trim();
	return url ? { mode: "single", url: URLString.of(url), tls } : undefined;
}

function _tlsFromEnv(env: RedisEnv): RedisTlsConfig | undefined {
	const mode = env.REDIS_TLS_MODE?.trim() || "optional";
	if (mode === "optional") {
		return undefined;
	}
	if (mode !== "required") {
		throw new RangeError(
			`REDIS_TLS_MODE must be optional or required, got ${mode}`
		);
	}
	if (!env.REDIS_TLS_CA) {
		throw new RangeError("REDIS_TLS_MODE=required needs REDIS_TLS_CA");
	}
	return {
		caPath: env.REDIS_TLS_CA,
		servername: env.REDIS_TLS_SERVERNAME || "redis",
	};
}

function _parseNode(entry: string): RedisNodeAddress {
	const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(entry);
	if (!match) {
		throw new RangeError(`Redis node must be host:port, got ${entry}`);
	}
	const host = match[1] ?? match[2];
	return {
		host: isIP(host) ? IPAddress.of(host) : Hostname.of(host),
		port: Port.of(Number(match[3])),
	};
}
