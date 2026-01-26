import {
  RegisterServicePayload,
  ServiceRegistrationResponse,
} from "./type";
import { AddressManagerConfig } from "../config/AddressManagerConfig";
import { AddressManagerError } from "../../common/utils/Errors";
import { HttpClient } from "../../common/utils/httpClient.js";
import { TokenManager } from "./tokenManager";

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
  /**
   * Initializes a new AddressManagerClient.
   */
  constructor(
    private readonly httpClient: HttpClient,
    private readonly tokenManager: TokenManager,
    private readonly config: AddressManagerConfig
  ) {}

  /**
   * Registers the current service with the Address Manager.
   *
   * - Called once during the bootstrap of the module.
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
    const payload: RegisterServicePayload = {
      name: this.config.serviceName,
      port: this.config.servicePort,
    };

    try {
      return await this.httpClient.post<ServiceRegistrationResponse>(
        `${this.config.addressManagerUrl}/services/register`,
        payload,
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
}