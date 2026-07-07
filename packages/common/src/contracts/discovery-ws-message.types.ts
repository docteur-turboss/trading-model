export enum DiscoveryWsMessageType {
	Heartbeat = "heartbeat",
	Register = "register",
	Subscribe = "subscribe",
	CacheInvalidate = "cache.invalidate",
}

export interface DiscoveryWsMessage {
	type: DiscoveryWsMessageType;
	payload: Record<string, unknown>;
}

export interface DiscoveryWsSubscribeMessage {
	type: DiscoveryWsMessageType.Subscribe;
	payload?: { services?: string[] };
}

export interface DiscoveryWsHeartbeatMessage {
	type: DiscoveryWsMessageType.Heartbeat;
	payload?: { serviceName?: string; instanceId?: string };
}

export type DiscoveryWsClientMessage =
	| DiscoveryWsSubscribeMessage
	| DiscoveryWsHeartbeatMessage;
