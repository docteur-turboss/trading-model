import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { buildRedisKey } from "@trading-model/common/persistence/redis-key-builder";

export function serviceInstancesSet(
	prefix: string,
	serviceName: ServiceInstanceName
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

export function servicePattern(prefix: string): string {
	return buildRedisKey(prefix, "service:*:instances");
}

export function parseServiceName(prefix: string, key: string): string | null {
	const match = key.match(
		new RegExp(`^${buildRedisKey(prefix, "service:(.+):instances")}$`)
	);
	return match ? match[1] : null;
}
