import { logger } from "@trading-model/common/config/logger";
import {
	type ServiceIdentity,
	toServiceIdentityKey,
} from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import { InstanceMetadataReader } from "./instance-metadata-reader";
import type { RedisDepsWithoutToken } from "./redis-deps";

export class InstanceHeartbeatHandler {
	private readonly _reader: InstanceMetadataReader;

	constructor(
		private readonly _deps: RedisDepsWithoutToken,
		reader?: InstanceMetadataReader
	) {
		this._reader = reader ?? new InstanceMetadataReader(_deps);
	}

	private async _checkInstanceExists(serviceName: string, instanceId: string): Promise<boolean> {
		const result = await this._deps.redis.sismember(
			this._deps.keyBuilder.serviceInstancesSet(serviceName),
			instanceId
		);
		return result === 1;
	}

	private async _persistHeartbeat(
		instanceId: string,
		instance: import("@trading-model/common/contracts/service-registry.types").ServiceInstance,
		serviceName: string
	): Promise<void> {
		const multi = this._deps.redis.multi();
		multi.set(
			this._deps.keyBuilder.instanceMetadata(instanceId),
			JSON.stringify(instance)
		);
		multi.set(
			this._deps.keyBuilder.instanceUpdatedBy(instanceId),
			toServiceIdentityKey({ serviceName, instanceId } as ServiceIdentity)
		);
		await multi.exec();
	}

	async updateHeartbeat(
		serviceName: string,
		instanceId: string
	): Promise<number | false> {
		const exists = await this._checkInstanceExists(serviceName, instanceId);
		if (!exists) {
			return false;
		}
		const instance = await this._reader.getMetadata(instanceId);
		if (!instance) {
			return false;
		}
		try {
			instance.lastHeartbeat = Math.max(instance.lastHeartbeat, Date.now());
			await this._persistHeartbeat(instanceId, instance, serviceName);
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
