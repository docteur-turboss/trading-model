export const mockDiscoveryResponse = [
  {
    serviceName: 'sector-allocator',
    instanceId: 'inst-1',
    ip: '10.0.1.5',
    port: 3000,
    version: '1.2.0',
    ttl: 30_000,
    protocol: 'mtls',
    registeredAt: Date.now() - 1000,
    lastHeartbeat: Date.now() - 500,
  },
  {
    serviceName: 'sector-allocator',
    instanceId: 'inst-2',
    ip: '10.0.1.6',
    port: 3000,
    version: '1.3.0',
    ttl: 30_000,
    protocol: 'mtls',
    registeredAt: Date.now() - 2000,
    lastHeartbeat: Date.now() - 1000,
  },
  {
    serviceName: 'sector-allocator',
    instanceId: 'inst-3',
    ip: '10.0.2.1',
    port: 3000,
    version: '2.0.0',
    ttl: 30_000,
    protocol: 'mtls',
    registeredAt: Date.now() - 3000,
    lastHeartbeat: Date.now() - 1500,
  },
];

export const mockResolvedTarget = {
  host: '10.0.1.5',
  port: 3000,
  version: '1.2.0',
};
