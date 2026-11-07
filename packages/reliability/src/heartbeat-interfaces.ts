import type { ServiceIdentity } from "@trading-model/primitives/service-identity";

/** Port that sends a service heartbeat to the discovery server. */
export interface IHeartbeatSender {
	sendHeartbeat(identity: ServiceIdentity): Promise<void>;
}
