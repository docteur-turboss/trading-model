import type { ServiceIdentity } from "../domain/service-identity";

export interface IHeartbeatSender {
	sendHeartbeat(identity: ServiceIdentity): Promise<void>;
}

export interface IHeartbeatReceiver {
	handleHeartbeat(identity: ServiceIdentity): Promise<number | false>;
}
