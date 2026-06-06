/** Payload for registering a new service instance in the registry. */
export interface ServiceRegisterPayload {
  name: string;
  address: string;
  port: number;
  protocol: 'http' | 'https';
  env?: string;
}

/** Payload sent periodically to signal that a service instance is alive. */
export interface HeartbeatPayload {
  serviceName: string;
  instanceId: string;
  authToken: string;
}

/** Payload for querying registered service instances. */
export interface ServicesQueryPayload {
  serviceName: string;
  services: Array<string>;
  onlyAlive: boolean;
}

/** A registered service instance with its connection metadata and health state. */
export interface ServiceInstance {
  lastHeartbeat: number;
  registeredAt: number;
  serviceName: string;
  instanceId: string;
  protocol: 'http' | 'https' | 'mtls';
  port: number;
  env?: string;
  ttl: number;
  ip: string;
}
