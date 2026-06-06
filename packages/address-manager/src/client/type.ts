/**
 * Payload sent during the initial registration of the service with the AM.
 */
export interface RegisterServicePayload {
  /* Logical service name (e.g. "TradingTrainer", "SocialScrapper") */
  serviceName: string;

  /* Port on which the service is listening */
  port: number;

  /* IP address of the service instance */
  ip: string;

  /* Optional unique instance identifier */
  instanceId?: string;
}

/**
 * Represents a service instance returned by the AM.
 */
export interface ServiceInstance {
  protocol: 'http' | 'https' | 'mtls';
  lastHeartbeat: number;
  registeredAt: number;
  serviceName: string;
  instanceId: string;
  port: number;
  env?: string;
  ttl: number;
  ip: string;
}

/** Response returned after a service registration. */
export interface ServiceRegistrationResponse extends ServiceInstance {
  token: string;
}
