import type {
	InstanceId,
	JsonObject,
	ServiceId,
} from "@trading-model/common/domain/primitives";

export enum DiscoveryWsMessageType {
	Heartbeat = "heartbeat",
	Register = "register",
	Subscribe = "subscribe",
	CacheInvalidate = "cache.invalidate",
}

export interface DiscoveryWsMessage {
	type: DiscoveryWsMessageType;
	payload: JsonObject;
}

export interface DiscoveryWsSubscribeMessage {
	type: DiscoveryWsMessageType.Subscribe;
	payload?: { services?: ServiceId[] };
}

export interface DiscoveryWsHeartbeatMessage {
	type: DiscoveryWsMessageType.Heartbeat;
	payload?: { serviceName?: ServiceId; instanceId?: InstanceId };
}

export type DiscoveryWsClientMessage =
	| DiscoveryWsSubscribeMessage
	| DiscoveryWsHeartbeatMessage;
