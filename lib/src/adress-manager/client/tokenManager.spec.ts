import { TokenManager } from "./tokenManager";
import { HttpClient } from "../utils/httpClient";
import { AddressManagerConfig } from "../config/AddressManagerConfig";
import { AuthenticationError } from "../../common/utils/Errors";

describe("TokenManager", () => {
  let httpClient: jest.Mocked<HttpClient>;
  let config: AddressManagerConfig;
  let manager: TokenManager;

  beforeEach(() => {
    httpClient = { post: jest.fn() } as unknown as jest.Mocked<HttpClient>;

    config = {
      addressManagerUrl: "https://address-manager.local",
      instanceId: "instance-1",
      serviceName: "test-service",
      servicePort: 8080,
      tokenRefreshIntervalMs: 300_000,
      ttlRefreshIntervalMs: 300_000,
      servicePingTimeoutMs: 2000,
      cacheTtlMs: 60_000,
    } as AddressManagerConfig;

    manager = new TokenManager(httpClient, config);
  });

  describe("getToken", () => {
    test("should throw AuthenticationError if token is not available", () => {
      expect(() => manager.getToken()).toThrow(AuthenticationError);
      expect(() => manager.getToken()).toThrow(
        "Token is not available. Did you call refreshToken()?"
      );
    });

    test("should return the token after successful refresh", async () => {
      const mockToken = "abc123";
      httpClient.post.mockResolvedValueOnce({ token: mockToken });

      await manager.refreshToken();

      const token = manager.getToken();
      expect(token).toBe(mockToken);
    });
  });

  describe("refreshToken", () => {
    test("should call HttpClient.post with correct URL and payload", async () => {
      const mockToken = "rotated-token";
      httpClient.post.mockResolvedValueOnce({ token: mockToken });

      await manager.refreshToken();

      expect(httpClient.post).toHaveBeenCalledWith(
        `${config.addressManagerUrl}/registry/token/rotate`,
        { instanceId: config.instanceId, serviceName: config.serviceName }
      );

      expect(manager.getToken()).toBe(mockToken);
    });

    test("should throw AuthenticationError if response is missing token", async () => {
      httpClient.post.mockResolvedValueOnce({});

      await expect(manager.refreshToken()).rejects.toThrow(AuthenticationError);
      await expect(manager.refreshToken()).rejects.toThrow(
        "Invalid token response from Address Manager"
      );
    });

    test("should throw AuthenticationError if HttpClient.post throws", async () => {
      const error = new Error("Network failure");
      httpClient.post.mockRejectedValueOnce(error);

      await expect(manager.refreshToken()).rejects.toThrow(AuthenticationError);
      await expect(manager.refreshToken()).rejects.toMatchObject({
        message: "Failed to refresh authentication token",
      });
    });
  });
});