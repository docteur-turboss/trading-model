/**
 * Payload envoyé lors de l'enregistrement initial du service auprès de l'AM.
 */
export interface RegisterServicePayload {
    /* Nom logique du service (ex: "TradingTrainer", "SocialScrapper") */
    name: string;
    /* Port sur lequel le service écoute */
    port: number;
}

/**
 * Représente une instance de service retournée par l'AM.
 */
export interface ServiceInstance {
    protocol: "http" | "https" | "mtls";
    lastHeartbeat: number;
    registeredAt: number;
    serviceName: string;
    instanceId: string;
    port: number;
    env?: string;
    ttl: number;
    ip: string;
}

/** Réponse retournée après l'enregistrement d'un service. */
export interface ServiceRegistrationResponse extends ServiceInstance {token: string;};