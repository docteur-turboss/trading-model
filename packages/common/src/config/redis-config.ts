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

export type RedisConnectionConfig =
	| { mode: "single"; url: string }
	| { mode: "sentinel"; config: RedisSentinelConfig }
	| { mode: "cluster"; config: RedisClusterNodesConfig };
