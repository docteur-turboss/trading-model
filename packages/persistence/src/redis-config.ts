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

export interface RedisSentinelConfig {
	sentinels: RedisNodeAddress[];
	name: string;
	/** ACL user of the data nodes (default user when absent). */
	username?: string;
	password?: string;
	/** Password the sentinels themselves require (`requirepass` on a sentinel). */
	sentinelPassword?: string;
}

export interface RedisClusterNodesConfig {
	nodes: RedisNodeAddress[];
	password?: string;
}

export type RedisConnectionMode = RedisConnectionConfig["mode"];

export type RedisConnectionConfig =
	| { mode: "single"; url: URLString }
	| { mode: "sentinel"; config: RedisSentinelConfig }
	| { mode: "cluster"; config: RedisClusterNodesConfig };
