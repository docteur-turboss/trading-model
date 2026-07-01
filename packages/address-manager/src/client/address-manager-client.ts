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

  private static localIP: string | null = null;

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

  async registerService(): Promise<ServiceRegistrationResponse | undefined> {
    const payload: RegisterServicePayload = {
      serviceName: this.config.serviceName,
      port: this.config.servicePort,
      ip: AddressManagerClient.getLocalIP(),
    };

    const urls = this.config.discoveryUrls?.length
      ? this.config.discoveryUrls
      : [this.config.addressManagerUrl];

    let lastError: unknown;

    for (const url of urls) {
      try {
        return await this.httpClient.post<ServiceRegistrationResponse>(`${url}/register`, payload);
      } catch (error) {
        lastError = error;
      }
    }

    throw new AppError(
      'Failed to register service to Address Manager',
      ErrorCodes.ADDRESS_MANAGER_ERROR,
      { cause: normalizeError(lastError) }
    );
  }

  async refreshTTL(): Promise<void> {
    const token = this.tokenManager.getToken();

    const urls = this.config.discoveryUrls?.length
      ? this.config.discoveryUrls
      : [this.config.addressManagerUrl];

    if (urls.length === 1) {
      try {
        await this.httpClient.post(
          `${urls[0]}/heartbeat`,
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
      return;
    }

    const results = await Promise.allSettled(
      urls.map(url =>
        this.httpClient.post(
          `${url}/heartbeat`,
          {
            serviceName: this.config.serviceName,
            instanceId: this.config.instanceId,
          },
          {
            headers: {
              'x-instance-token': token,
            },
          }
        )
      )
    );

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length === results.length) {
      throw new AppError('Failed to refresh service TTL', ErrorCodes.ADDRESS_MANAGER_ERROR, {
        cause: normalizeError((failures[0] as PromiseRejectedResult).reason),
      });
    }
  }

  async unregisterService(): Promise<void> {
    const token = this.tokenManager.getToken();
    const urls = this.config.discoveryUrls?.length
      ? this.config.discoveryUrls
      : [this.config.addressManagerUrl];

    for (const url of urls) {
      try {
        await this.httpClient.post(
          `${url}/unregister`,
          { serviceName: this.config.serviceName, instanceId: this.config.instanceId },
          { headers: { 'x-instance-token': token } }
        );
        return;
      } catch {
        // try next URL
      }
    }
  }

  private static cachedLocalIP: string | null = null;

  hasIpChanged(): boolean {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) {
          if (AddressManagerClient.cachedLocalIP === null) {
            AddressManagerClient.cachedLocalIP = net.address;
            return false;
          }
          return net.address !== AddressManagerClient.cachedLocalIP;
        }
      }
    }
    return false;
  }
}
