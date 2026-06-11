export interface ServiceRegistryEntry {
  serviceName: string;
  instances: ServiceInstance[];
  topology?: TopologyLink[];
}

export interface ServiceInstance {
  instanceId: string;
  host: string;
  port: number;
  version: string;
  heartbeat: Date;
  status: 'healthy' | 'degraded' | 'down';
}

export interface TopologyLink {
  source: string;
  target: string;
  status: 'healthy' | 'degraded' | 'down';
}
