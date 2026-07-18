import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { RedisKeyBuilder } from "@trading-model/common/persistence/redis-key-builder";

export class ServiceRegistryKeyBuilder extends RedisKeyBuilder {
	serviceInstancesSet(serviceName: ServiceInstanceName): string {
		return this.key("service", serviceName, "instances");
	}

	instanceMetadata(instanceId: InstanceId): string {
		return this.key("instance", instanceId, "metadata");
	}

	instanceToken(instanceId: InstanceId): string {
		return this.key("instance", instanceId, "token");
	}

	instanceUpdatedBy(instanceId: InstanceId): string {
		return this.key("instance", instanceId, "updatedBy");
	}

	servicePattern(): string {
		return this.key("service:*:instances");
	}

	parseServiceName(key: string): string | null {
		const match = key.match(
			new RegExp(`^${this.key("service:(.+):instances")}$`)
		);
		return match ? match[1] : null;
	}
}
