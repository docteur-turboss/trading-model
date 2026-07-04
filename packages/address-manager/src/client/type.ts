import { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";

export { ServiceInstance };

/**
 * Payload sent during the initial registration of the service with the AM.
 */
export interface RegisterServicePayload {
	/** Logical service name (e.g. "TradingTrainer", "SocialScraper") */
	serviceName: string;

	/** Port on which the service is listening */
	port: number;

	/** IP address of the service instance */
	ip: string;

	/** Optional unique instance identifier */
	instanceId?: string;
}

/** Response returned after a service registration. */
export interface ServiceRegistrationResponse extends ServiceInstance {
	token: string;
}
