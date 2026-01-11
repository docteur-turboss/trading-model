import { ServiceDiscovery } from "./serviceDiscovery";
import { ServiceCache } from "./serviceCache";
import { ServiceHealthChecker } from "./serviceHealthChecker";
import { AddressManagerClient } from "../client/addressManagerClient";
import {
  ServiceNotFoundError,
  ServiceUnreachableError,
} from "../../common/utils/Errors";
import { ServiceInstance } from "adress-manager/client/type";

/* eslint-disable */

describe("ServiceDiscovery", () => {
  let discovery: ServiceDiscovery;
  let cache: jest.Mocked<ServiceCache>;
  let healthChecker: jest.Mocked<ServiceHealthChecker>;
  let addressManagerClient: jest.Mocked<AddressManagerClient>;

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
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
      clear: jest.fn(),
    } as any;

    healthChecker = {
      isHealthy: jest.fn(),
    } as any;

    addressManagerClient = {
      getServiceAddress: jest.fn(),
    } as any;

    discovery = new ServiceDiscovery(addressManagerClient, cache, healthChecker);
  });

  test("returns cached instance if healthy", async () => {
    cache.get.mockReturnValue(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    const result = await discovery.findService(serviceName);

    expect(result).toEqual(instance);
    expect(cache.get).toHaveBeenCalledWith(serviceName);
    expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
    expect(cache.invalidate).not.toHaveBeenCalled();
    expect(addressManagerClient.getServiceAddress).not.toHaveBeenCalled();
  });

  test("fetches from AddressManager if cache is empty", async () => {
    cache.get.mockReturnValue(null);
    addressManagerClient.getServiceAddress.mockResolvedValue(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    const result = await discovery.findService(serviceName);

    expect(result).toEqual(instance);
    expect(addressManagerClient.getServiceAddress).toHaveBeenCalledWith(serviceName);
    expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });

  test("invalidates cache and refetches if cached instance is unhealthy", async () => {
    cache.get.mockReturnValue(instance);
    healthChecker.isHealthy.mockResolvedValueOnce(false); // cached instance unhealthy
    addressManagerClient.getServiceAddress.mockResolvedValue(instance);
    healthChecker.isHealthy.mockResolvedValueOnce(true); // newly fetched instance healthy

    const result = await discovery.findService(serviceName);

    expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
    expect(result).toEqual(instance);
    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });

  test("throws ServiceNotFoundError if service not registered", async () => {
    cache.get.mockReturnValue(null);
    addressManagerClient.getServiceAddress.mockRejectedValue(new Error("not found"));

    await expect(discovery.findService(serviceName)).rejects.toThrow(ServiceNotFoundError);

    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  test("throws ServiceUnreachableError if fetched service is unhealthy", async () => {
    cache.get.mockReturnValue(null);
    addressManagerClient.getServiceAddress.mockResolvedValue(instance);
    healthChecker.isHealthy.mockResolvedValue(false);

    await expect(discovery.findService(serviceName)).rejects.toThrow(ServiceUnreachableError);

    expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
    expect(cache.set).not.toHaveBeenCalled();
  });

  test("sets fetched healthy service in cache", async () => {
    cache.get.mockReturnValue(null);
    addressManagerClient.getServiceAddress.mockResolvedValue(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    await discovery.findService(serviceName);

    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });
});