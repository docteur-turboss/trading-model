import type { URLString } from "../domain/primitives";
import type { HostPort } from "../domain/service-identity";

export interface RedisSentinelConfig {
	sentinels: HostPort[];
	name: string;
	password?: string;
}

export interface RedisClusterNodesConfig {
	nodes: HostPort[];
	password?: string;
}

export type RedisConnectionMode = RedisConnectionConfig["mode"];

export type RedisConnectionConfig =
	| { mode: "single"; url: URLString }
	| { mode: "sentinel"; config: RedisSentinelConfig }
	| { mode: "cluster"; config: RedisClusterNodesConfig };
