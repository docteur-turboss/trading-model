import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ServiceResolver } from '../../src/core/service-resolver';
import { mockDiscoveryResponse } from '../fixtures/index';

describe('ServiceResolver', () => {
  let resolver: ServiceResolver;
  let mockHttpClient: { get: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    mockHttpClient = {
      get: jest.fn().mockResolvedValue(mockDiscoveryResponse),
    };
    resolver = new ServiceResolver('https://discovery:3000', 5000, mockHttpClient as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should resolve a service by name and major version', async () => {
    const target = await resolver.resolve('sector-allocator', 1);
    expect(target).not.toBeNull();
    expect(target!.version).toMatch(/^1\./);
    expect(target!.host).toBeDefined();
    expect(target!.port).toBeDefined();
  });

  it('should filter by major version', async () => {
    const v1 = await resolver.resolve('sector-allocator', 1);
    expect(v1).not.toBeNull();
    expect(v1!.version.startsWith('1.')).toBe(true);

    const v2 = await resolver.resolve('sector-allocator', 2);
    expect(v2).not.toBeNull();
    expect(v2!.version.startsWith('2.')).toBe(true);
  });

  it('should return null when no instances match the version', async () => {
    const target = await resolver.resolve('sector-allocator', 3);
    expect(target).toBeNull();
  });

  it('should return null for unknown service', async () => {
    mockHttpClient.get.mockResolvedValue([]);
    const target = await resolver.resolve('unknown-service', 1);
    expect(target).toBeNull();
  });

  it('should cache resolved instances within TTL', async () => {
    await resolver.resolve('sector-allocator', 1);
    await resolver.resolve('sector-allocator', 1);

    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });

  it('should re-fetch after cache expires', async () => {
    await resolver.resolve('sector-allocator', 1);

    jest.advanceTimersByTime(6000);

    await resolver.resolve('sector-allocator', 1);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
  });

  it('should round-robin through instances', async () => {
    mockHttpClient.get.mockResolvedValue([
      { ...mockDiscoveryResponse[0], version: '1.0.0' },
      { ...mockDiscoveryResponse[1], version: '1.0.0' },
    ]);

    const first = await resolver.resolve('sector-allocator', 1);
    const second = await resolver.resolve('sector-allocator', 1);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.host).not.toBe(second!.host);
  });

  it('should return stale cached data when discovery is unreachable', async () => {
    await resolver.resolve('sector-allocator', 1);

    jest.advanceTimersByTime(6000);

    mockHttpClient.get.mockRejectedValue(new Error('Connection refused'));

    const target = await resolver.resolve('sector-allocator', 1);
    expect(target).not.toBeNull();
  });

  it('should invalidate cache for a specific service', async () => {
    await resolver.resolve('sector-allocator', 1);
    resolver.invalidateCache('sector-allocator');

    await resolver.resolve('sector-allocator', 1);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
  });

  it('should invalidate entire cache', async () => {
    await resolver.resolve('sector-allocator', 1);
    resolver.invalidateCache();

    await resolver.resolve('sector-allocator', 1);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
  });
});
