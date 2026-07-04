import type { ServiceInstanceName } from "@trading-model/common/config/services.types";

/** Configuration for the MessageManagerClient. */
export interface MessageManagerConfig {
	serviceName: ServiceInstanceName;
	callbackPath: string;
	instanceId: string;
}
