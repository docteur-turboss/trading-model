export interface ServiceRegisterPayload {
  name: string;
  address: string;
  port: number;
  protocol: "http" | "https";
  metadata?: Record<string, any>;
  env?: string;
  role?: string | null;
}

export interface HeartbeatPayload {
  serviceName: string;
  instanceId: string;
  authToken: string;
}

export interface ServicesQueryPayload {
  serviceName: string;
  services: Array<string>;
  metadata: Record<string, any>;
  onlyAlive: boolean;
}

export interface ServiceInstance {
    metadata?: Record<string, any>;
    lastHeartbeat: number;
    registeredAt: number;
    role?: string | null;
    serviceName: string;
    instanceId: string;
    protocol: string;
    port: number;
    env?: string;
    ttl: number;
    ip: string;
}