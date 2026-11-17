import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/primitives/primitives";

/** Configuration for the MessageManagerClient. */
export interface MessageManagerConfig {
	serviceName: ServiceInstanceName;
	callbackPath: string;
	instanceId: InstanceId;
}
