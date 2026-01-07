import { HttpClient } from "../utils/httpClient.js";
import { TokenManager } from "./tokenManager";
import {
  RegisterServicePayload,
  ServiceInstance,
  ServiceRegistrationResponse,
} from "./type";
import { AddressManagerError } from "../../common/utils/Errors";
import { AddressManagerConfig } from "../config/AddressManagerConfig";

/**
 * AddressManagerClient
 *
 * Responsibilities:
 * - Register the current service with the Address Manager
 * - Refresh the TTL of the registered service
 * - Retrieve the address of a remote service
 *
 * Constraints:
 * - No caching logic
 * - No business retry logic
 * - Only uses the token provided by TokenManager
 *
 * This class abstracts all interactions with the Address Manager API.
 */
export class AddressManagerClient {
  private readonly httpClient: HttpClient;
  private readonly tokenManager: TokenManager;
  private readonly config: AddressManagerConfig;

  /**
   * Initializes a new AddressManagerClient.
   *
   * @param httpClient - HTTP client to perform API calls.
   * @param tokenManager - Provides the authentication token.
   * @param config - Address Manager configuration and service metadata.
   */
  constructor(
    httpClient: HttpClient,
    tokenManager: TokenManager,
    config: AddressManagerConfig
  ) {
    this.httpClient = httpClient;
    this.tokenManager = tokenManager;
    this.config = config;
  }

  /**
   * Registers the current service with the Address Manager.
   *
   * - Called once during the bootstrap of the module.
   * - Uses the token from TokenManager for authorization.
   *
   * @returns Promise resolving to the service registration response.
   * @throws AddressManagerError if registration fails.
   *
   * @example
   * ```ts
   * const response = await client.registerService();
   * ```
   */
  async registerService(): Promise<ServiceRegistrationResponse> {
    const token = this.tokenManager.getToken();

    const payload: RegisterServicePayload = {
      name: this.config.serviceName,
      port: this.config.servicePort,
    };

    try {
      return await this.httpClient.post<ServiceRegistrationResponse>(
        `${this.config.addressManagerUrl}/services/register`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (error) {
      throw new AddressManagerError(
        "Failed to register service to Address Manager",
        error
      );
    }
  }

  /**
   * Refreshes the TTL (time-to-live) of the registered service.
   *
   * - Typically called periodically by a scheduled job.
   * - Ensures the service remains visible to other services.
   *
   * @throws AddressManagerError if the TTL refresh fails.
   *
   * @example
   * ```ts
   * await client.refreshTTL();
   * ```
   */
  async refreshTTL(): Promise<void> {
    const token = this.tokenManager.getToken();

    try {
      await this.httpClient.post(
        `${this.config.addressManagerUrl}/services/ttl/refresh`,
        {
          serviceName: this.config.serviceName,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (error) {
      throw new AddressManagerError(
        "Failed to refresh service TTL",
        error
      );
    }
  }

  /**
   * Retrieves the address of a service by its name.
   *
   * - No health check or availability validation is performed here.
   * - Useful for resolving service endpoints prior to invoking them.
   *
   * @param serviceName - The name of the target service.
   * @returns Promise resolving to the service instance information.
   * @throws AddressManagerError if fetching the service address fails.
   *
   * @example
   * ```ts
   * const instance = await client.getServiceAddress("user-service");
   * ```
   */
  async getServiceAddress(serviceName: string): Promise<ServiceInstance> {
    const token = this.tokenManager.getToken();

    try {
      return await this.httpClient.get<ServiceInstance>(
        `${this.config.addressManagerUrl}/services/${serviceName}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (error) {
      throw new AddressManagerError(
        `Failed to fetch service address for "${serviceName}"`,
        error
      );
    }
  }
}