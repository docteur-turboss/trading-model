import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { toServiceIdentityKey, type ServiceIdentity } from "@trading-model/common/domain/service-identity";
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

	async updateHeartbeat(
		serviceName: string,
		instanceId: string
	): Promise<number | false> {
		const exists = await this._deps.redis.sismember(
			this._deps.keyBuilder.serviceInstancesSet(serviceName),
			instanceId
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
