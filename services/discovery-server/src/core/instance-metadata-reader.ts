import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { RedisDepsWithoutToken } from "./redis-deps";

export class InstanceMetadataReader {
	constructor(private readonly _deps: RedisDepsWithoutToken) {}

	async getMetadata(instanceId: string): Promise<ServiceInstance | undefined> {
		const json = await this._deps.redis.get(
			this._deps.keyBuilder.instanceMetadata(instanceId)
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
		return this._deps.redis.smembers(
			this._deps.keyBuilder.serviceInstancesSet(serviceName)
		);
	}

	async getMetadatas(keys: string[]): Promise<ServiceInstance[]> {
		const results = await this._deps.redis.mget(keys);
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
		const keys = await this._deps.redis.keys(
			this._deps.keyBuilder.servicePattern()
		);
		return keys
			.map((key) => this._deps.keyBuilder.parseServiceName(key))
			.filter((name): name is string => name !== null);
	}
}
