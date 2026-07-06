export type DiscoveryWsMessageType =
	| "heartbeat"
	| "register"
	| "subscribe"
	| "cache.invalidate";

export interface DiscoveryWsMessage {
	type: DiscoveryWsMessageType;
	payload: Record<string, unknown>;
}

export interface DiscoveryWsSubscribeMessage {
	type: "subscribe";
	payload?: { services?: string[] };
}

export interface DiscoveryWsHeartbeatMessage {
	type: "heartbeat";
	payload?: { serviceName?: string; instanceId?: string };
}

export type DiscoveryWsClientMessage =
	| DiscoveryWsSubscribeMessage
	| DiscoveryWsHeartbeatMessage;
