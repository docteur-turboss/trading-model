import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import type Redis from "ioredis";
import type { RedisKeyBuilder } from "./redis-key-builder";

export class InstanceMetadataReader {
	constructor(
		private readonly _redis: Redis,
		private readonly _keyBuilder: RedisKeyBuilder
	) {}

	async getMetadata(instanceId: string): Promise<ServiceInstance | undefined> {
		const json = await this._redis.get(
			this._keyBuilder.instanceMetadata(instanceId)
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

	async getServiceInstanceIds(serviceName: string): Promise<string[]> {
		return this._redis.smembers(
			this._keyBuilder.serviceInstancesSet(serviceName)
		);
	}

	async getMetadatas(keys: string[]): Promise<ServiceInstance[]> {
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

	async listServiceNames(): Promise<string[]> {
		const keys = await this._redis.keys(this._keyBuilder.servicePattern());
		return keys
			.map((key) => this._keyBuilder.parseServiceName(key))
			.filter((name): name is string => name !== null);
	}
}
