import { logger } from "@trading-model/common/config/logger";
import type {
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis from "ioredis";
import { RedisKeyBuilder } from "./redis-key-builder";
import { TokenService } from "./token-service";

export class RedisInstanceRepository {
	constructor(
		private readonly _redis: Redis,
		private readonly _keyBuilder: RedisKeyBuilder,
		private readonly _tokenService: TokenService,
	) {}

	private async _resolveToken(instanceId: string): Promise<string> {
		const tokenKey = this._keyBuilder.instanceToken(instanceId);
		const token = this._tokenService.generateInstanceToken(instanceId);
		const tokenSet = await this._redis.set(tokenKey, token, "NX");
		return tokenSet === "OK"
			? token
			: ((await this._redis.get(tokenKey)) ?? token);
	}

	private async _buildStoredInstance(
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
		const finalToken = await this._resolveToken(instanceId);

		const multi = this._redis.multi();
		multi.sadd(this._keyBuilder.serviceInstancesSet(serviceName), instanceId);
		const storedInstance = await this._buildStoredInstance(instance, now);
		multi.set(
			this._keyBuilder.instanceMetadata(instanceId),
			JSON.stringify(storedInstance),
		);
		await multi.exec();

		return finalToken;
	}

	async updateHeartbeat({
		serviceName,
		instanceId,
	}: ServiceIdentity): Promise<number | false> {
		const exists = await this._redis.sismember(
			this._keyBuilder.serviceInstancesSet(serviceName),
			instanceId,
		);

		if (!exists) {
			return false;
		}

		const json = await this._redis.get(
			this._keyBuilder.instanceMetadata(instanceId),
		);
		if (!json) {
			return false;
		}

		try {
			const instance: ServiceInstance = JSON.parse(json);
			instance.lastHeartbeat = Math.max(instance.lastHeartbeat, Date.now());

			const multi = this._redis.multi();
			multi.set(
				this._keyBuilder.instanceMetadata(instanceId),
				JSON.stringify(instance),
			);
			multi.set(
				this._keyBuilder.instanceUpdatedBy(instanceId),
				`${serviceName}:${instanceId}`,
			);
			await multi.exec();

			return instance.ttl;
		} catch (err) {
			logger.warn("Failed to update heartbeat in Redis", {
				serviceName,
				instanceId,
				err: normalizeError(err),
			});
			return false;
		}
	}

	async getInstances(serviceName: string): Promise<ServiceInstance[]> {
		const instanceIds = await this._redis.smembers(
			this._keyBuilder.serviceInstancesSet(serviceName),
		);

		if (instanceIds.length === 0) {
			return [];
		}

		const keys = instanceIds.map((id) =>
			this._keyBuilder.instanceMetadata(id),
		);
		const results = await this._redis.mget(keys);

		const instances: ServiceInstance[] = [];
		for (const json of results) {
			if (json) {
				try {
					instances.push(JSON.parse(json));
				} catch (err) {
					logger.warn("Skipping corrupt instance entry in Redis", {
						err: normalizeError(err),
					});
				}
			}
		}

		return instances;
	}

	async getInstance({
		instanceId,
	}: ServiceIdentity): Promise<ServiceInstance | undefined> {
		const json = await this._redis.get(
			this._keyBuilder.instanceMetadata(instanceId),
		);
		if (!json) {
			return;
		}

		try {
			return JSON.parse(json);
		} catch (err) {
			logger.warn("Failed to parse instance metadata from Redis", {
				instanceId,
				err: normalizeError(err),
			});
		}
	}

	async removeInstance({
		serviceName,
		instanceId,
	}: ServiceIdentity): Promise<boolean> {
		const multi = this._redis.multi();
		multi.srem(this._keyBuilder.serviceInstancesSet(serviceName), instanceId);
		multi.del(this._keyBuilder.instanceMetadata(instanceId));
		multi.del(this._keyBuilder.instanceToken(instanceId));
		multi.del(this._keyBuilder.instanceUpdatedBy(instanceId));

		const results = await multi.exec();
		if (!results) {
			return false;
		}

		const sremResult = results[0];
		return sremResult?.[1] === 1;
	}

	async listServiceNames(): Promise<string[]> {
		const keys = await this._redis.keys(this._keyBuilder.servicePattern());
		return keys
			.map((key) => this._keyBuilder.parseServiceName(key))
			.filter((name): name is string => name !== null);
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		const serviceNames = await this.listServiceNames();
		const snapshot: Record<string, ServiceInstance[]> = {};

		for (const name of serviceNames) {
			snapshot[name] = await this.getInstances(name);
		}

		return snapshot;
	}
}
