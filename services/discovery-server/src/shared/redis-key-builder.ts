import { buildRedisKey } from "@trading-model/persistence/redis-key-builder";
import type { InstanceId } from "@trading-model/primitives/primitives";

/** Takes the raw name: callers hold a `ServiceId` (identity) or a `ServiceInstanceName` (query). */
export function serviceInstancesSet(
	prefix: string,
	serviceName: string
): string {
	return buildRedisKey(prefix, "service", serviceName, "instances");
}

export function instanceMetadata(
	prefix: string,
	instanceId: InstanceId
): string {
	return buildRedisKey(prefix, "instance", instanceId, "metadata");
}

export function instanceToken(prefix: string, instanceId: InstanceId): string {
	return buildRedisKey(prefix, "instance", instanceId, "token");
}

export function instanceUpdatedBy(
	prefix: string,
	instanceId: InstanceId
): string {
	return buildRedisKey(prefix, "instance", instanceId, "updatedBy");
}
