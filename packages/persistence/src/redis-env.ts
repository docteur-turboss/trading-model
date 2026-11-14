import { isIP } from "node:net";
import {
	Hostname,
	IPAddress,
	Port,
	URLString,
} from "@trading-model/primitives/primitives";
import type {
	RedisConnectionConfig,
	RedisNodeAddress,
	RedisTlsConfig,
} from "./redis-config";

const DEFAULT_SENTINEL_MASTER_NAME = "mymaster";

/** Environment variables a service reads to reach Redis. */
export interface RedisEnv {
	/** Single-node connection, used when no sentinel is configured. */
	REDIS_URL?: string;
	/** Comma-separated sentinels, `host:port` with an IP or DNS name (`[ipv6]:port`). */
	REDIS_SENTINELS?: string;
	REDIS_SENTINEL_MASTER_NAME?: string;
	/** ACL user of the service (K8s: one per service, limited to its key prefix). */
	REDIS_USERNAME?: string;
	REDIS_PASSWORD?: string;
	/** Password of the sentinels, when they require one. */
	REDIS_SENTINEL_PASSWORD?: string;
	/**
	 * `optional` (default, release N): clear connections, TLS not used yet.
	 * `required` (release N+1): TLS to the nodes and sentinels, REDIS_TLS_CA needed.
	 */
	REDIS_TLS_MODE?: string;
	/** Path of the PEM CA of the Redis server certificates. */
	REDIS_TLS_CA?: string;
	/** Name the server certificate carries (default `redis`). */
	REDIS_TLS_SERVERNAME?: string;
}

/** Parses `host:port,host:port`; throws a RangeError on a malformed entry. */
export function parseRedisNodes(list: string): RedisNodeAddress[] {
	return list
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map(_parseNode);
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
