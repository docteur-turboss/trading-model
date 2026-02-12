import { ServiceHealthChecker } from "./serviceHealthChecker";
import { HttpClient } from "../../common/config/httpClient";
import { ServiceInstance } from "../client/type";

/* eslint-disable */
describe("ServiceHealthChecker", () => {
  let httpClient: jest.Mocked<HttpClient>;
  let checker: ServiceHealthChecker;

  const instance: ServiceInstance = {
    ip: "127.0.0.1",
    port: 8080,
    instanceId: "instance-1",
    lastHeartbeat: Date.now(),
    protocol: "http",
    registeredAt: Date.now(),
    serviceName: "user-service",
    ttl: 30000,
  };

  beforeEach(() => {
    httpClient = {
      get: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    checker = new ServiceHealthChecker(httpClient, 2000); // timeout 2s
  });

  test("returns true if the service responds successfully", async () => {
    httpClient.get.mockResolvedValueOnce({}); // simulate successful GET

    const result = await checker.isHealthy(instance);

    expect(result).toBe(true);
    expect(httpClient.get).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/ping",
      { timeoutMs: 2000 }
    );
  });

  test("returns false if the HTTP client throws an error", async () => {
    httpClient.get.mockRejectedValueOnce(new Error("Network error"));

    const result = await checker.isHealthy(instance);

    expect(result).toBe(false);
    expect(httpClient.get).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/ping",
      { timeoutMs: 2000 }
    );
  });

  test("calls the HTTP client with the correct timeout", async () => {
    httpClient.get.mockResolvedValueOnce({});

    await checker.isHealthy(instance);

    expect(httpClient.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeoutMs: 2000 })
    );
  });

  test("buildPingUrl generates correct URL", async () => {
    // Using any-cast to access private method
    const url = (checker as any).buildPingUrl(instance);
    expect(url).toBe("http://127.0.0.1:8080/ping");
  });
});