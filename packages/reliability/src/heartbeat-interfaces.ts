import type { ServiceIdentity } from "@trading-model/primitives/service-identity";

/** Port that sends a service heartbeat to the discovery server. */
export interface IHeartbeatSender {
	sendHeartbeat(identity: ServiceIdentity): Promise<void>;
}

/** Port that handles a received heartbeat; resolves to a number on success, `false` when rejected. */
export interface IHeartbeatReceiver {
	handleHeartbeat(identity: ServiceIdentity): Promise<number | false>;
}
