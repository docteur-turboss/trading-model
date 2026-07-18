import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { RedisDepsWithoutToken } from "./redis-deps";

export async function removeInstanceSetAndMetadata(
	deps: RedisDepsWithoutToken,
	identity: ServiceIdentity
): Promise<boolean> {
	const multi = deps.redis.multi();
	multi.srem(
		deps.keyBuilder.serviceInstancesSet(identity.serviceName as string),
		identity.instanceId
	);
	multi.del(deps.keyBuilder.instanceMetadata(identity.instanceId));
	multi.del(deps.keyBuilder.instanceToken(identity.instanceId));
	multi.del(deps.keyBuilder.instanceUpdatedBy(identity.instanceId));

	const results = await multi.exec();
	if (!results) {
		return false;
	}

	const sremResult = results[0];
	return sremResult?.[1] === 1;
}
