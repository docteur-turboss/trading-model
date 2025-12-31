export interface ServiceRegisterPayload {
  name: string;
  address: string;
  port: number;
  protocol: "http" | "https";
  env?: string;
}

export interface HeartbeatPayload {
  serviceName: string;
  instanceId: string;
  authToken: string;
}

export interface ServicesQueryPayload {
  serviceName: string;
  services: Array<string>;
  onlyAlive: boolean;
}

export interface ServiceInstance {
    lastHeartbeat: number;
    registeredAt: number;
    serviceName: string;
    instanceId: string;
    protocol: "http" | "https" | "mtls";
    port: number;
    env?: string;
    ttl: number;
    ip: string;
}