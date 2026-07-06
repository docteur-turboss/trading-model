import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis from "ioredis";
import { RedisKeyBuilder } from "./redis-key-builder";
import { TokenService } from "./token-service";

export class InstanceRegistrar {
	constructor(
		private readonly _redis: Redis,
		private readonly _keyBuilder: RedisKeyBuilder,
		private readonly _tokenService: TokenService,
	) {}

	async resolveToken(instanceId: string): Promise<string> {
		const tokenKey = this._keyBuilder.instanceToken(instanceId);
		const token = this._tokenService.generateInstanceToken(instanceId);
		const tokenSet = await this._redis.set(tokenKey, token, "NX");
		return tokenSet === "OK"
			? token
			: ((await this._redis.get(tokenKey)) ?? token);
	}

	async buildStoredInstance(
		instance: ServiceInstance,
		now: number,
	): Promise<ServiceInstance> {
		const storedInstance: ServiceInstance = {
			...instance,
			registeredAt: instance.registeredAt ?? now,
			lastHeartbeat: now,
		};
		const existingJson = await this._redis.get(
			this._keyBuilder.instanceMetadata(instance.instanceId),
		);
		if (existingJson) {
			try {
				const existing: ServiceInstance = JSON.parse(existingJson);
				storedInstance.registeredAt = existing.registeredAt;
				storedInstance.lastHeartbeat = Math.max(
					storedInstance.lastHeartbeat,
					existing.lastHeartbeat,
				);
			} catch (err) {
				logger.warn("Failed to parse existing instance metadata", {
					instanceId: instance.instanceId,
					err: normalizeError(err),
				});
			}
		}
		return storedInstance;
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const { serviceName, instanceId } = instance;
		const now = Date.now();
		const finalToken = await this.resolveToken(instanceId);

		const multi = this._redis.multi();
		multi.sadd(this._keyBuilder.serviceInstancesSet(serviceName), instanceId);
		const storedInstance = await this.buildStoredInstance(instance, now);
		multi.set(
			this._keyBuilder.instanceMetadata(instanceId),
			JSON.stringify(storedInstance),
		);
		await multi.exec();

		return finalToken;
	}
}
