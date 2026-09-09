import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "@trading-model/validation/adapters/outbound/service-registry.types";
import type { RedisDepsWithoutToken } from "../../shared/redis-deps";
import {
	instanceMetadata,
	parseServiceName,
	serviceInstancesSet,
	servicePattern,
} from "../../shared/redis-key-builder";

export class InstanceMetadataReader {
	constructor(private readonly _deps: RedisDepsWithoutToken) {}

	async getMetadata(
		instanceId: InstanceId
	): Promise<ServiceInstance | undefined> {
		const json = await this._deps.redis.get(
			instanceMetadata(this._deps.keyPrefix, instanceId)
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

	getServiceInstanceIds(serviceName: ServiceInstanceName): Promise<string[]> {
		return this._deps.redis.smembers(
			serviceInstancesSet(this._deps.keyPrefix, serviceName)
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
			servicePattern(this._deps.keyPrefix)
		);
		return keys
			.map((key) => parseServiceName(this._deps.keyPrefix, key))
			.filter((name): name is string => name !== null);
	}
}
