import { normalizeError } from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { InstanceId } from "@trading-model/primitives/primitives";
import {
	ALL_SERVICE_NAMES,
	type ServiceInstanceName,
} from "@trading-model/primitives/service-instance-name";
import type { RedisDeps } from "../../shared/redis-deps";
import {
	instanceMetadata,
	serviceInstancesSet,
} from "../../shared/redis-key-builder";

export class InstanceMetadataReader {
	constructor(private readonly _deps: RedisDeps) {}

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

	/**
	 * Services with at least one registered instance. Service names form a
	 * closed set: one SCARD per known name instead of a KEYS scan, which
	 * blocks Redis for the whole keyspace.
	 */
	async listServiceNames(): Promise<ServiceInstanceName[]> {
		const names = [...ALL_SERVICE_NAMES];
		const sizes = await Promise.all(
			names.map((name) =>
				this._deps.redis.scard(serviceInstancesSet(this._deps.keyPrefix, name))
			)
		);
		return names.filter((_name, index) => sizes[index] > 0);
	}
}
