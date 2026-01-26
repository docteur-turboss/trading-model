import { AddressManagerClient } from "./addressManagerClient";
import { HttpClient } from "../../common/config/httpClient";
import { TokenManager } from "./tokenManager";
import { AddressManagerConfig } from "../config/AddressManagerConfig";
import { AddressManagerError } from "../../common/utils/Errors";
import { ServiceRegistrationResponse } from "../client/type";

describe("AddressManagerClient", () => {
  let httpClient: jest.Mocked<HttpClient>;
  let tokenManager: jest.Mocked<TokenManager>;
  let config: AddressManagerConfig;
  let client: AddressManagerClient;

  beforeEach(() => {
    httpClient = { get: jest.fn(), post: jest.fn() } as unknown as jest.Mocked<HttpClient>;
    tokenManager = { getToken: jest.fn() } as unknown as jest.Mocked<TokenManager>;
    tokenManager.getToken.mockReturnValue("mock-token");

    config = {
      addressManagerUrl: "http://localhost:8443",
      serviceName: "test-service",
      servicePort: 8080,
      tokenRefreshIntervalMs: 300_000,
      ttlRefreshIntervalMs: 300_000,
      servicePingTimeoutMs: 2000,
      cacheTtlMs: 60_000,
    } as AddressManagerConfig;

    client = new AddressManagerClient(httpClient, tokenManager, config);
  });

  describe("registerService", () => {
    test("should call HttpClient.post with correct URL, payload, and headers", async () => {
      const response: ServiceRegistrationResponse = { 
        ip: "127.0.0.1",
        port: 8080,
        instanceId: "instance-1",
        lastHeartbeat: Date.now(),
        protocol: "http",
        registeredAt: Date.now(),
        serviceName: "abc-service",
        token: "service-token",
        ttl: 30000, 
      };
      httpClient.post.mockResolvedValueOnce(response);

      const result = await client.registerService();

      expect(result).toEqual(response);
      expect(httpClient.post).toHaveBeenCalledWith(
        `${config.addressManagerUrl}/services/register`,
        { name: config.serviceName, port: config.servicePort },
      );
    });

    test("should throw AddressManagerError if HttpClient.post fails", async () => {
      const error = new Error("Network failure");

      httpClient.post.mockRejectedValueOnce(error);
      await expect(client.registerService()).rejects.toBeInstanceOf(AddressManagerError);
      httpClient.post.mockRejectedValueOnce(error);
      await expect(client.registerService()).rejects.toMatchObject({
        message: "Failed to register service to Address Manager",
      });
    });
  });

  describe("refreshTTL", () => {
    test("should call HttpClient.post with correct URL and headers", async () => {
      httpClient.post.mockResolvedValueOnce(undefined);

      await client.refreshTTL();

      expect(httpClient.post).toHaveBeenCalledWith(
        `${config.addressManagerUrl}/services/ttl/refresh`,
        { serviceName: config.serviceName },
        { headers: { Authorization: "Bearer mock-token" } }
      );
    });

    test("should throw AddressManagerError if HttpClient.post fails", async () => {
      const error = new Error("TTL refresh failed");

      httpClient.post.mockRejectedValueOnce(error);
      await expect(client.refreshTTL()).rejects.toBeInstanceOf(AddressManagerError);
      httpClient.post.mockRejectedValueOnce(error);
      await expect(client.refreshTTL()).rejects.toMatchObject({
        message: "Failed to refresh service TTL",
      });
    });
  });
});