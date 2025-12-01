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
}

export interface ServicesQueryPayload {
  serviceName: string;
  services: Array<string>;
  metadata: Record<string, any>;
  onlyAlive: boolean;
}

export interface ServiceInstance {
    instanceId: string;
    serviceName: string;
    ip: string;
    port: number;
    protocol: string;
    metadata?: Record<string, any>;
    registeredAt: number;
    lastHeartbeat: number;
    ttl: number;
    env?: string;
    role?: string | null;
}