import { HttpClient } from '../../utils/HttpClient';
import { AuthenticationError } from "../../utils/Errors";
import { AddressManagerConfig } from 'adress-manager/config/AddressManagerConfig';

/**
 * TokenManager
 * 
 * Responsabilités : 
 * - Stocker le token en mémoire
 * - Rafraîchir le token de manière sécurisée
 * - Exposer le token courant
 * 
 * Le reste du système ne sait PAS :
 * - Comment le token est obtenu
 * - Quand il expire
 * - Comment il est renouvelé
 */
export class TokenManager {
    private readonly httpClient: HttpClient;
    private readonly config: AddressManagerConfig;

    private token: string | null = null;

    constructor(httpClient: HttpClient, config: AddressManagerConfig) {
        this.httpClient = httpClient;
        this.config = config;
    }

    /**
     * Retourne le token courant.
     * 
     * @throws AuthenticationError si le token n'est pas disponible.
     * @return string - Le token courant.
     */
    getToken(): string {
        if (!this.token) {
            throw new AuthenticationError("Token is not available. Did you call refreshToken()?");
        }

        return this.token;
    }

    /**
     * Rafraîchit le token auprès de l'Adress Manager.
     * 
     * Cette méthode :
     * - Remplace atomiquement le token en mémoire
     * - Ne fait aucun retry
     * - Laisse la gestion temporelle au scheduler
     */
    async refreshToken(): Promise<void> {
        try{
            const reponse = await this.httpClient.post<{token: string}>(
                `${this.config.addressManagerUrl}/registry/token/rotate`,
                {
                    instanceId: this.config.instanceId,
                    serviceName: this.config.serviceName
                },
            )

            if(!response || !response.token) throw new AuthenticationError("Invalid token response from Address Manager");

            this.token = reponse.token;
        }catch(e){
            throw new AuthenticationError("Failed to refresh authentication token", e);
        }
    }
}