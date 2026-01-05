import { HttpClient } from "../utils/HttpClient";
import { TokenManager } from "./TokenManager";
import {
  RegisterServicePayload,
  ServiceInstance,
  ServiceRegistrationResponse,
} from "./types";
import { AddressManagerError } from "../utils/Errors";
import { AddressManagerConfig } from "../config/AddressManagerConfig";

/**
 * AddressManagerClient
 *
 * Responsabilités :
 * - Enregistrer le service courant auprès de l'Address Manager
 * - Rafraîchir le TTL du service
 * - Récupérer l'adresse d'un service distant
 *
 * Contraintes :
 * - Aucune logique de cache
 * - Aucune logique de retry métier
 * - N'utilise QUE le token fourni par TokenManager
 */
export class AddressManagerClient {
  private readonly httpClient: HttpClient;
  private readonly tokenManager: TokenManager;
  private readonly config: AddressManagerConfig;

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
   * Enregistre le service courant auprès de l'Address Manager.
   * Appelé une seule fois au bootstrap.
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
   * Rafraîchit le TTL du service courant.
   * Appelé périodiquement par un cron job.
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
   * Récupère l'adresse d'un service par son nom.
   * Aucune validation de disponibilité ici.
   */
  async getServiceAddress(
    serviceName: string
  ): Promise<ServiceInstance> {
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