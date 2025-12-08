import { ResponseException } from "cash-lib/middleware/responseException";
import { catchSync } from "cash-lib/middleware/catchError";
import { ServiceRegistry } from "../core/ServiceRegistry";
import { HeartbeatPayload } from "core/types";

export class HeartbeatController {
    constructor(
        private registry: ServiceRegistry,
    ) {}

    /**
     * POST /heartbeat
     * Payload:
     * {
     *   serviceName: string,
     *   instanceId: string
     * }
     */
    handle = catchSync(async (req, res) => {
        const { serviceName, instanceId, authToken } = req.body as Partial<HeartbeatPayload>;

        let errorToken = false;
        let errorName = false;

        // --- Validation basique ---
        if (!serviceName || !instanceId) throw ResponseException({error : `Missing serviceName or instanceId`}).BadRequest();
        if(!authToken || typeof authToken !== "string") errorToken = true;
        if(!this.registry.verifyInstanceName(serviceName)) errorName = true;

        // --- Payload normalizer ---
        const payload: HeartbeatPayload = {
            serviceName: `${serviceName}`.trim(),
            instanceId: `${instanceId}`.trim(),
            authToken: `${authToken}`.trim()
        }

        // --- Vérifier que le service est enregistré ---
        const instance = this.registry.getInstance(payload.serviceName, payload.instanceId);

        if (!instance || errorName) throw ResponseException({error : "Invalid serviceName"}).BadRequest();
        if(!this.registry.validInstanceToken(payload.authToken, payload.instanceId) || errorToken) throw ResponseException({error: "Missing or invalid authToken"}).Unauthorized();

        // --- Generate new token ---
        const newToken = this.registry.generateInstanceToken(instance.instanceId);

        // --- Rafraîchir le TTL (lease) & update Token ---
        const ttl = this.registry.updateHeartbeat(payload.serviceName, payload.instanceId, newToken);

        if (!ttl) throw ResponseException({error : "Failed to refresh lease"}).UnknownError();
            
        // --- Répondre au service ---
        throw ResponseException({
            status: "ok",
            token: newToken,
            message: "Heartbeat updated",
            ttl
        }).Success();
    });
}