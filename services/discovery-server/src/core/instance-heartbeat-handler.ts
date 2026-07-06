import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis from "ioredis";
import { RedisKeyBuilder } from "./redis-key-builder";
import { InstanceMetadataReader } from "./instance-metadata-reader";

export class InstanceHeartbeatHandler {
	private readonly _reader: InstanceMetadataReader;

	constructor(
		private readonly _redis: Redis,
		private readonly _keyBuilder: RedisKeyBuilder,
		reader?: InstanceMetadataReader,
	) {
		this._reader = reader ?? new InstanceMetadataReader(_redis, _keyBuilder);
	}

	async updateHeartbeat(
		serviceName: string,
		instanceId: string,
	): Promise<number | false> {
		const exists = await this._redis.sismember(
			this._keyBuilder.serviceInstancesSet(serviceName),
			instanceId,
		);

		if (!exists) {
			return false;
		}

		const instance = await this._reader.getMetadata(instanceId);
		if (!instance) {
			return false;
		}

		try {
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
}
