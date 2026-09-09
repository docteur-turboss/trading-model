import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { RedisDepsWithoutToken } from "../../shared/redis-deps";
import {
	instanceMetadata,
	instanceToken,
	instanceUpdatedBy,
	serviceInstancesSet,
} from "../../shared/redis-key-builder";

export async function removeInstanceSetAndMetadata(
	deps: RedisDepsWithoutToken,
	identity: ServiceIdentity
): Promise<boolean> {
	const multi = deps.redis.multi();
	multi.srem(
		serviceInstancesSet(
			deps.keyPrefix,
			identity.serviceName as ServiceInstanceName
		),
		identity.instanceId
	);
	multi.del(instanceMetadata(deps.keyPrefix, identity.instanceId));
	multi.del(instanceToken(deps.keyPrefix, identity.instanceId));
	multi.del(instanceUpdatedBy(deps.keyPrefix, identity.instanceId));

	const results = await multi.exec();
	if (!results) {
		return false;
	}

	const sremResult = results[0];
	return sremResult?.[1] === 1;
}
