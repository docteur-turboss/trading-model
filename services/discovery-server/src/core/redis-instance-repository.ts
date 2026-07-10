import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { RedisDeps } from "./redis-deps";
import { RedisInstanceStore } from "./redis-instance-store";

export class RedisInstanceRepository {
	private readonly _store: RedisInstanceStore;

	constructor(deps: RedisDeps) {
		this._store = new RedisInstanceStore(deps);
	}

	registerInstance(instance: ServiceInstance): Promise<string> {
		return this._store.registerInstance(instance);
	}

	updateHeartbeat(identity: ServiceIdentity): Promise<number | false> {
		return this._store.updateHeartbeat(identity);
	}

	getInstances(serviceName: ServiceInstanceName): Promise<ServiceInstance[]> {
		return this._store.getInstances(serviceName);
	}

	getInstance(identity: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._store.getInstance(identity);
	}

	removeInstance(identity: ServiceIdentity): Promise<boolean> {
		return this._store.removeInstance(identity);
	}

	listServiceNames(): Promise<ServiceInstanceName[]> {
		return this._store.listServiceNames();
	}

	dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._store.dump();
	}
}
