import { bootstrapAddressManagerModule, AddressManagerModule } from "./moduleBootstrap";
import { Application } from "express";
import { AddressManagerConfig } from "../config/AddressManagerConfig";

import { TokenManager } from "../client/tokenManager";
import { AddressManagerClient } from "../client/addressManagerClient";
import { ServiceDiscovery } from "../discovery/serviceDiscovery";
import { Scheduler } from "../scheduler/scheduler";
import { TokenRefresherJob } from "../scheduler/tokenRefreshJob";
import { TtlRefresherJob } from "../scheduler/ttlRefresherJob";

/* eslint-disable */
jest.mock("../utils/httpClient");
jest.mock("../client/tokenManager");
jest.mock("../client/addressManagerClient");
jest.mock("../discovery/serviceDiscovery");
jest.mock("../scheduler/scheduler");
jest.mock("../scheduler/tokenRefreshJob");
jest.mock("../scheduler/ttlRefresherJob");
jest.mock("../http/routes/ping.routes", () => ({
  pingRoutes: "mockedPingRoutes",
}));

describe("bootstrapAddressManagerModule", () => {
  let app: Partial<Application>;
  let config: AddressManagerConfig;

  let mockTokenManager: jest.Mocked<TokenManager>;
  let mockAddressManagerClient: jest.Mocked<AddressManagerClient>;
  let mockScheduler: jest.Mocked<Scheduler>;

  beforeEach(() => {
    app = {
      use: jest.fn(),
    };

    config = {
      cacheTtlMs: 60000,
      servicePingTimeoutMs: 5000,
      tokenRefreshIntervalMs: 300000,
      ttlRefreshIntervalMs: 300000,
      instanceId: "test-instance",
      serviceName: "test-service",
    } as unknown as AddressManagerConfig;

    // Reset mocks
    jest.clearAllMocks();

    // Mock TokenManager
    mockTokenManager = new (TokenManager as any)() as jest.Mocked<TokenManager>;
    mockTokenManager.refreshToken.mockResolvedValue(undefined);

    // Mock AddressManagerClient
    mockAddressManagerClient = new (AddressManagerClient as any)() as jest.Mocked<AddressManagerClient>;
    mockAddressManagerClient.registerService.mockResolvedValue({
    protocol: "mtls",
    lastHeartbeat: 1234567890,
    registeredAt: 1234567890,
    serviceName: "test-service",
    instanceId: "test-instance",
    port: 8080,
    ttl: 60000,
    ip: "127.0.0.1",
    token: "mocked-token",
});

    // Mock Scheduler
    mockScheduler = new (Scheduler)() as jest.Mocked<Scheduler>;
  });

  test("should instantiate all components and expose public API", async () => {
    const moduleApi: AddressManagerModule = await bootstrapAddressManagerModule(
      app as Application,
      config
    );

    // Exposes serviceDiscovery
    expect(moduleApi.serviceDiscovery).toBeInstanceOf(ServiceDiscovery);

    // Exposes stop function
    expect(typeof moduleApi.stop).toBe("function");
  });

  test("should call refreshToken on TokenManager", async () => {
    await bootstrapAddressManagerModule(app as Application, config);
    expect(mockTokenManager.refreshToken).toHaveBeenCalledTimes(1);
  });

  test("should call registerService on AddressManagerClient", async () => {
    await bootstrapAddressManagerModule(app as Application, config);
    expect(mockAddressManagerClient.registerService).toHaveBeenCalledTimes(1);
  });

  test("should mount ping routes on Express app", async () => {
    await bootstrapAddressManagerModule(app as Application, config);
    expect(app.use).toHaveBeenCalledWith("mockedPingRoutes");
  });

  test("should register TokenRefresherJob and TtlRefresherJob with scheduler", async () => {
    await bootstrapAddressManagerModule(app as Application, config);

    // Scheduler.register should have been called twice
    expect(mockScheduler.register).toHaveBeenCalledTimes(2);

    // First job is TokenRefresherJob
    expect(mockScheduler.register.mock.calls[0][0]).toBeInstanceOf(TokenRefresherJob);

    // Second job is TtlRefresherJob
    expect(mockScheduler.register.mock.calls[1][0]).toBeInstanceOf(TtlRefresherJob);

    // Scheduler.start should have been called once
    expect(mockScheduler.start).toHaveBeenCalledTimes(1);
  });

  test("stop function should stop the scheduler", async () => {
    const moduleApi = await bootstrapAddressManagerModule(app as Application, config);

    await moduleApi.stop();
    expect(mockScheduler.stop).toHaveBeenCalledTimes(1);
  });
});