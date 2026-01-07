import { HttpClient } from '../utils/httpClient.js';
import { AuthenticationError } from "../../common/utils/Errors";
import { AddressManagerConfig } from '../config/AddressManagerConfig';

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
    private readonly httpClient: HttpClient;
    private readonly config: AddressManagerConfig;

    private token: string | null = null;

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
    constructor(httpClient: HttpClient, config: AddressManagerConfig) {
        this.httpClient = httpClient;
        this.config = config;
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
            throw new AuthenticationError(
                "Token is not available. Did you call refreshToken()?"
            );
        }

        return this.token;
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
                `${this.config.addressManagerUrl}/registry/token/rotate`,
                {
                    instanceId: this.config.instanceId,
                    serviceName: this.config.serviceName
                }
            );

            if (!response || !response.token) {
                throw new AuthenticationError(
                    "Invalid token response from Address Manager"
                );
            }

            this.token = response.token;
        } catch (e) {
            throw new AuthenticationError(
                "Failed to refresh authentication token",
                e
            );
        }
    }
}