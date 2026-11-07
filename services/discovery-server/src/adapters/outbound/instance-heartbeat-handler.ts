import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { UnixTimestamp } from "@trading-model/primitives/primitives";
import { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { RedisDepsWithoutToken } from "../../shared/redis-deps";
import {
	instanceMetadata,
	instanceUpdatedBy,
	serviceInstancesSet,
} from "../../shared/redis-key-builder";
import { InstanceMetadataReader } from "./instance-metadata-reader";

// Writes the heartbeat only while the instance is still registered, so a
// heartbeat racing the stale-instance cleaner cannot resurrect its metadata.
const PERSIST_IF_REGISTERED_SCRIPT = `
  if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 0 then
    return 0
  end
  redis.call('SET', KEYS[2], ARGV[2])
  redis.call('SET', KEYS[3], ARGV[3])
  return 1
`;

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
			serviceInstancesSet(this._deps.keyPrefix, identity.serviceName),
			identity.instanceId
		);
		return result === 1;
	}

	private async _persistHeartbeat(
		identity: ServiceIdentity,
		instance: import("@trading-model/contracts/service-registry-types").ServiceInstance
	): Promise<boolean> {
		const persisted = await this._deps.redis.eval(
			PERSIST_IF_REGISTERED_SCRIPT,
			3,
			serviceInstancesSet(this._deps.keyPrefix, identity.serviceName),
			instanceMetadata(this._deps.keyPrefix, identity.instanceId),
			instanceUpdatedBy(this._deps.keyPrefix, identity.instanceId),
			identity.instanceId,
			JSON.stringify(instance),
			ServiceIdentity.toKey(identity)
		);
		return persisted === 1;
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
			instance.lastHeartbeat = Math.max(
				instance.lastHeartbeat,
				Date.now()
			) as UnixTimestamp;
			const persisted = await this._persistHeartbeat(identity, instance);
			return persisted ? instance.ttl : false;
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
