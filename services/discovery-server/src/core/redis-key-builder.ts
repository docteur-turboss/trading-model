import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";

export class RedisKeyBuilder {
	constructor(private readonly _prefix: string) {}

	serviceInstancesSet(serviceName: ServiceInstanceName): string {
		return `${this._prefix}service:${serviceName}:instances`;
	}

	instanceMetadata(instanceId: InstanceId): string {
		return `${this._prefix}instance:${instanceId}:metadata`;
	}

	instanceToken(instanceId: InstanceId): string {
		return `${this._prefix}instance:${instanceId}:token`;
	}

	instanceUpdatedBy(instanceId: InstanceId): string {
		return `${this._prefix}instance:${instanceId}:updatedBy`;
	}

	servicePattern(): string {
		return `${this._prefix}service:*:instances`;
	}

	parseServiceName(key: string): string | null {
		const match = key.match(
			new RegExp(`^${this._prefix}service:(.+):instances$`)
		);
		return match ? match[1] : null;
	}
}
