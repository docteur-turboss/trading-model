import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { UnixTimestamp } from "@trading-model/primitives/primitives";

export interface DiscoveryContext {
	serviceName: ServiceInstanceName;
	startTime: UnixTimestamp;
}
