import { HttpClient } from '@trading-model/common/config/http-client';
import { AppError, ErrorCodes } from '@trading-model/common/utils/errors';

import { AddressManagerConfig } from '../config/address-manager-config';

/**
 * TokenManager
 *
 * Responsibilities:
 * - Store the authentication token in memory
 * - Securely refresh the token when needed
 * - Expose the current token to the system
 *
 * Encapsulates all token management details. The rest of the system does NOT know:
 * - How the token is obtained
 * - When it expires
 * - How it is renewed
 */
export class TokenManager {
  private token: string | null;

  /**
   * Initializes a new TokenManager.
   *
   * @param httpClient - HTTP client used to request token rotations.
   * @param config - Configuration for the Address Manager client.
   *
   * @example
   * ```ts
   * const manager = new TokenManager(httpClient, config);
   * await manager.refreshToken();
   * const token = manager.getToken();
   * ```
   */
  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: AddressManagerConfig
  ) {
    this.token = null;
  }

  /**
   * Returns the current authentication token.
   *
   * @throws AuthenticationError if the token is not available.
   * @returns string - The current token.
   *
   * @example
   * ```ts
   * const token = tokenManager.getToken();
   * ```
   */
  getToken(): string {
    if (!this.token) {
      throw new AppError(
        'Token is not available. Did you call refreshToken()?',
        ErrorCodes.AUTHENTICATION_ERROR
      );
    }

    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  /** Explicitly clear the stored token from memory. */
  clearToken(): void {
    this.token = null;
  }

  /**
   * Refreshes the authentication token from the Address Manager.
   *
   * Behavior:
   * - Atomically replaces the token in memory
   * - Does NOT perform retries
   * - Timing and scheduling of refresh is managed externally (e.g., via scheduler)
   *
   * @throws AuthenticationError if the token cannot be obtained or response is invalid.
   *
   * @example
   * ```ts
   * await tokenManager.refreshToken();
   * const token = tokenManager.getToken();
   * ```
   */
  async refreshToken(): Promise<void> {
    try {
      const response = await this.httpClient.post<{ token: string }>(
        `${this.config.addressManagerUrl}/token/rotate`,
        {
          instanceId: this.config.instanceId,
          serviceName: this.config.serviceName,
        },
        {
          headers: {
            'x-instance-token': this.getToken(),
          },
        }
      );

      if (!response || !response.token) {
        throw new AppError(
          'Invalid token response from Address Manager',
          ErrorCodes.AUTHENTICATION_ERROR
        );
      }

      this.token = response.token;
    } catch (e) {
      if (e instanceof AppError && e.code === ErrorCodes.AUTHENTICATION_ERROR) throw e;
      throw new AppError(
        'Failed to refresh authentication token',
        ErrorCodes.AUTHENTICATION_ERROR,
        { cause: e }
      );
    }
  }
}
