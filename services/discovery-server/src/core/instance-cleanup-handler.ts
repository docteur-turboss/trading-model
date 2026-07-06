import type Redis from "ioredis";
import type { RedisKeyBuilder } from "./redis-key-builder";

export class InstanceCleanupHandler {
	constructor(
		private readonly _redis: Redis,
		private readonly _keyBuilder: RedisKeyBuilder
	) {}

	async removeInstanceSetAndMetadata(
		serviceName: string,
		instanceId: string
	): Promise<boolean> {
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
}
