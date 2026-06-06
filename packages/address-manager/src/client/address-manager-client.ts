import { networkInterfaces } from 'os';

import { HttpClient } from '@trading-model/common/config/http-client';
import { AddressManagerError } from '@trading-model/common/utils/errors';

import { TokenManager } from './token-manager';
import { RegisterServicePayload, ServiceRegistrationResponse } from './type';
import { AddressManagerConfig } from '../config/address-manager-config';

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

  /** Resolves the local non-internal IPv4 address of this machine. Falls back to 127.0.0.1. */
  private static getLocalIP(): string {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
    return '127.0.0.1';
  }

  /**
   * Registers the current service with the Address Manager.
   *
   * Called once during bootstrap. Sends the service name, port, and local IP.
   *
   * @returns The registration response containing the instance details and token.
   * @throws AddressManagerError if the registration request fails.
   */
  async registerService(): Promise<ServiceRegistrationResponse | undefined> {
    const payload: RegisterServicePayload = {
      serviceName: this.config.serviceName,
      port: this.config.servicePort,
      ip: AddressManagerClient.getLocalIP(),
    };

    try {
      return await this.httpClient.post<ServiceRegistrationResponse>(
        `${this.config.addressManagerUrl}/register`,
        payload
      );
    } catch (error) {
      throw new AddressManagerError('Failed to register service to Address Manager', error);
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
        `${this.config.addressManagerUrl}/heartbeat`,
        {
          serviceName: this.config.serviceName,
          instanceId: this.config.instanceId,
        },
        {
          headers: {
            'x-instance-token': token,
          },
        }
      );
    } catch (error) {
      throw new AddressManagerError('Failed to refresh service TTL', error);
    }
  }
}
