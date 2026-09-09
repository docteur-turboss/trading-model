import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	InstanceId,
	IPAddress,
	Port,
} from "@trading-model/common/domain/primitives";
import { ServiceInstance } from "@trading-model/validation/adapters/outbound/service-registry.types";

export { ServiceInstance };

/**
 * Payload sent during the initial registration of the service with the AM.
 */
export interface RegisterServicePayload {
	/** Logical service name (e.g. "TradingTrainer", "SocialScraper") */
	serviceName: ServiceInstanceName;

	/** Port on which the service is listening */
	port: Port;

	/** IP address of the service instance */
	ip: IPAddress;

	/** Optional unique instance identifier */
	instanceId?: InstanceId;
}

/** Response returned after a service registration. */
export interface ServiceRegistrationResponse extends ServiceInstance {
	token: string;
}
