import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { logger } from "@trading-model/common/config/logger";
import { REDIS_RESP, REDIS_SET } from "@trading-model/common/persistence/redis-constants";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { RedisDeps } from "./redis-deps";

export class InstanceRegistrar {
	constructor(private readonly _deps: RedisDeps) {}

	async resolveToken(instanceId: InstanceId): Promise<string> {
		const tokenKey = this._deps.keyBuilder.instanceToken(instanceId);
		const token = this._deps.tokenService.generateInstanceToken(instanceId);
		const tokenSet = await this._deps.redis.set(tokenKey, token, REDIS_SET.NX);
		return tokenSet === REDIS_RESP.OK
			? token
			: ((await this._deps.redis.get(tokenKey)) ?? token);
	}

	private async _mergeExistingMetadata(
		instanceId: InstanceId,
		storedInstance: ServiceInstance
	): Promise<void> {
		const existingJson = await this._deps.redis.get(
			this._deps.keyBuilder.instanceMetadata(instanceId)
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
			);
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
			lastHeartbeat: now,
		};
		await this._mergeExistingMetadata(instance.instanceId, storedInstance);
		return storedInstance;
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const { serviceName, instanceId } = instance;
		const now = Date.now();
		const finalToken = await this.resolveToken(instanceId);
		const multi = this._deps.redis.multi();
		multi.sadd(
			this._deps.keyBuilder.serviceInstancesSet(serviceName as unknown as ServiceInstanceName),
			instanceId
		);
		const storedInstance = await this.buildStoredInstance(instance, now);
		multi.set(
			this._deps.keyBuilder.instanceMetadata(instanceId),
			JSON.stringify(storedInstance)
		);
		await multi.exec();
		return finalToken;
	}
}
