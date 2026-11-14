import type {
	Hostname,
	IPAddress,
	Port,
	URLString,
} from "@trading-model/primitives/primitives";

/** A Redis or Sentinel node, reached by IP address or DNS name. */
export interface RedisNodeAddress {
	host: IPAddress | Hostname;
	port: Port;
}

/**
 * TLS towards Redis and the sentinels (issue #930, ADR-0047). `servername` is
 * the name the server certificate must carry: nodes are reached by the IP
 * Sentinel announces, which no certificate can list.
 */
export interface RedisTlsConfig {
	/** Path of the PEM CA that signed the server certificates. */
	caPath: string;
	servername: string;
}

export interface RedisSentinelConfig {
	sentinels: RedisNodeAddress[];
	name: string;
	/** ACL user of the data nodes (default user when absent). */
	username?: string;
	password?: string;
	/** Password the sentinels themselves require (`requirepass` on a sentinel). */
	sentinelPassword?: string;
	tls?: RedisTlsConfig;
}

export type RedisConnectionMode = RedisConnectionConfig["mode"];

export type RedisConnectionConfig =
	| { mode: "single"; url: URLString; tls?: RedisTlsConfig }
	| { mode: "sentinel"; config: RedisSentinelConfig };
