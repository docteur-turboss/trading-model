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

	private async _checkInstanceExists(
		identity: ServiceIdentity
	): Promise<boolean> {
		const result = await this._deps.redis.sismember(
			this._deps.keyBuilder.serviceInstancesSet(identity.serviceName),
			identity.instanceId
		);
		return result === 1;
	}

	private async _persistHeartbeat(
		identity: ServiceIdentity,
		instance: import("@trading-model/common/contracts/service-registry.types").ServiceInstance
	): Promise<void> {
		const multi = this._deps.redis.multi();
		multi.set(
			this._deps.keyBuilder.instanceMetadata(identity.instanceId),
			JSON.stringify(instance)
		);
		multi.set(
			this._deps.keyBuilder.instanceUpdatedBy(identity.instanceId),
			toServiceIdentityKey(identity)
		);
		await multi.exec();
	}

	async updateHeartbeat(identity: ServiceIdentity): Promise<number | false> {
		const exists = await this._checkInstanceExists(identity);
		if (!exists) {
			return false;
		}
		const instance = await this._reader.getMetadata(identity.instanceId);
		if (!instance) {
			return false;
		}
		try {
			instance.lastHeartbeat = Math.max(instance.lastHeartbeat, Date.now());
			await this._persistHeartbeat(identity, instance);
			return instance.ttl;
		} catch (err) {
			logger.warn("Failed to update heartbeat in Redis", {
				serviceName: identity.serviceName,
				instanceId: identity.instanceId,
				err: normalizeError(err),
			});
			return false;
		}
	}
}
