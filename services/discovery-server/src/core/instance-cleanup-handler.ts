import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { RedisDepsWithoutToken } from "./redis-deps";

export class InstanceCleanupHandler {
	constructor(private readonly _deps: RedisDepsWithoutToken) {}

	async removeInstanceSetAndMetadata(
		serviceName: ServiceInstanceName,
		instanceId: InstanceId
	): Promise<boolean> {
		const multi = this._deps.redis.multi();
		multi.srem(
			this._deps.keyBuilder.serviceInstancesSet(serviceName),
			instanceId
		);
		multi.del(this._deps.keyBuilder.instanceMetadata(instanceId));
		multi.del(this._deps.keyBuilder.instanceToken(instanceId));
		multi.del(this._deps.keyBuilder.instanceUpdatedBy(instanceId));

		const results = await multi.exec();
		if (!results) {
			return false;
		}

		const sremResult = results[0];
		return sremResult?.[1] === 1;
	}
}
