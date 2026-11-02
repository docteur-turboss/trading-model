import type {
	AuthToken,
	InstanceId,
} from "@trading-model/primitives/primitives";

/**
 * Last token issued to each instance. With several discovery replicas, a
 * heartbeat may reach any of them: the store must then be shared (Redis).
 */
export interface InstanceTokenStorePort {
	get(instanceId: InstanceId): Promise<AuthToken | undefined>;
	set(instanceId: InstanceId, token: AuthToken): Promise<void>;
	delete(instanceId: InstanceId): Promise<void>;
}
