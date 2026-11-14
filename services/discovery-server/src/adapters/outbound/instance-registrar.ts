import { normalizeError } from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import { logger } from "@trading-model/http/infrastructure/logger";
import type {
	InstanceId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { RedisDeps } from "../../shared/redis-deps";
import {
	instanceMetadata,
	serviceInstancesSet,
} from "../../shared/redis-key-builder";

export class InstanceRegistrar {
	constructor(private readonly _deps: RedisDeps) {}

	private async _mergeExistingMetadata(
		instanceId: InstanceId,
		storedInstance: ServiceInstance
	): Promise<void> {
		const existingJson = await this._deps.redis.get(
			instanceMetadata(this._deps.keyPrefix, instanceId)
		);
		if (!existingJson) {
			return;
		}
		try {
			const existing: ServiceInstance = JSON.parse(existingJson);
			storedInstance.registeredAt = existing.registeredAt;
			storedInstance.lastHeartbeat = Math.max(
				storedInstance.lastHeartbeat,
				existing.lastHeartbeat
			) as UnixTimestamp;
		} catch (err) {
			logger.warn("Failed to parse existing instance metadata", {
				instanceId,
				err: normalizeError(err),
			});
		}
	}

	async buildStoredInstance(
		instance: ServiceInstance,
		now: number
	): Promise<ServiceInstance> {
		const storedInstance: ServiceInstance = {
			...instance,
			registeredAt: instance.registeredAt ?? now,
			lastHeartbeat: now as UnixTimestamp,
		};
		await this._mergeExistingMetadata(instance.instanceId, storedInstance);
		return storedInstance;
	}

	async registerInstance(instance: ServiceInstance): Promise<void> {
		const { serviceName, instanceId } = instance;
		const now = Date.now();
		const multi = this._deps.redis.multi();
		multi.sadd(
			serviceInstancesSet(this._deps.keyPrefix, serviceName),
			instanceId
		);
		const storedInstance = await this.buildStoredInstance(instance, now);
		multi.set(
			instanceMetadata(this._deps.keyPrefix, instanceId),
			JSON.stringify(storedInstance)
		);
		await multi.exec();
	}
}
