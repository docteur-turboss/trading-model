import { ServiceCache } from "./serviceCache";
import { ServiceInstance } from "../client/type";

describe("ServiceCache", () => {
  let cache: ServiceCache;
  const ttlMs = 100; // court TTL pour test
  const serviceName = "user-service";
  const instance: ServiceInstance = {
    ip: "127.0.0.1",
    port: 8080,
    instanceId: "instance-1",
    lastHeartbeat: Date.now(),
    protocol: "http",
    registeredAt: Date.now(),
    serviceName: serviceName,
    ttl: 30000,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new ServiceCache(ttlMs);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should return null for missing service", () => {
    expect(cache.get("unknown-service")).toBeNull();
  });

  test("should store and retrieve a service instance", () => {
    cache.set(serviceName, instance);
    const retrieved = cache.get(serviceName);
    expect(retrieved).toEqual(instance);
  });

  test("should expire an entry after TTL", () => {
    cache.set(serviceName, instance);
    // avancer le temps au-delà du TTL
    jest.advanceTimersByTime(ttlMs + 1);
    expect(cache.get(serviceName)).toBeNull();
  });

  test("should invalidate a specific service", () => {
    cache.set(serviceName, instance);
    cache.invalidate(serviceName);
    expect(cache.get(serviceName)).toBeNull();
  });

  test("should clear all services", () => {
    cache.set(serviceName, instance);
    cache.set("other-service", { instanceId: "2", ip: "127.0.0.2", port: 9090, protocol: "http", lastHeartbeat: Date.now(), registeredAt: Date.now(), serviceName: "other-service", ttl: 30000 });
    cache.clear();
    expect(cache.get(serviceName)).toBeNull();
    expect(cache.get("other-service")).toBeNull();
  });

  test("should not delete valid entries before TTL", () => {
    cache.set(serviceName, instance);
    jest.advanceTimersByTime(ttlMs - 10);
    expect(cache.get(serviceName)).toEqual(instance);
  });
});