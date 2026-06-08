import { networkInterfaces } from 'os';

import { HttpClient } from '@trading-model/common/config/http-client';
import { AppError, ErrorCodes, normalizeError } from '@trading-model/common/utils/errors';

import { TokenManager } from './token-manager';
import { RegisterServicePayload, ServiceRegistrationResponse } from './type';
import { AddressManagerConfig } from '../config/address-manager-config';

export class AddressManagerClient {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly tokenManager: TokenManager,
    private readonly config: AddressManagerConfig
  ) {}

  /** Cached local IP, resolved once. Reset in tests via {@link resetLocalIP}. */
  private static localIP: string | null = null;

  /** Reset the cached local IP (test support). */
  static resetLocalIP(): void {
    AddressManagerClient.localIP = null;
  }

  private static getLocalIP(): string {
    if (AddressManagerClient.localIP) return AddressManagerClient.localIP;
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) {
          AddressManagerClient.localIP = net.address;
          return net.address;
        }
      }
    }
    AddressManagerClient.localIP = '127.0.0.1';
    return '127.0.0.1';
  }

  /**
   * Registers the current service with the Address Manager.
   *
   * Called once during bootstrap. Sends the service name, port, and local IP.
   *
   * @returns The registration response containing the instance details and token.
   * @throws AddressManagerError if the registration request fails. The original
   *   error (network, timeout, HTTP) is preserved in the `cause` property.
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
      throw new AppError(
        'Failed to register service to Address Manager',
        ErrorCodes.ADDRESS_MANAGER_ERROR,
        { cause: normalizeError(error) }
      );
    }
  }

  /**
   * Refreshes the TTL (time-to-live) of the registered service.
   *
   * - Typically called periodically by a scheduled job.
   * - Ensures the service remains visible to other services.
   *
   * @throws AddressManagerError if the TTL refresh fails. The original
   *   error (network, timeout, HTTP) is preserved in the `cause` property.
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
      throw new AppError('Failed to refresh service TTL', ErrorCodes.ADDRESS_MANAGER_ERROR, {
        cause: normalizeError(error),
      });
    }
  }
}
