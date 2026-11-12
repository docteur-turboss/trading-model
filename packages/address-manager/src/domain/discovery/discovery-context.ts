import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { UnixTimestamp } from "@trading-model/primitives/primitives";

/** Service being discovered and the discovery start time. */
export interface DiscoveryContext {
	serviceName: ServiceInstanceName;
	startTime: UnixTimestamp;
}
