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
        const { serviceName, instanceId } = req.body as Partial<HeartbeatPayload>;

        // --- Validation basique ---
        if (!serviceName || !instanceId) throw ResponseException({error : `Missing serviceName or instanceId`}).BadRequest();

        // --- Payload normalizer ---
        const payload: HeartbeatPayload = {
            serviceName: `${serviceName}`.trim(),
            instanceId: `${instanceId}`.trim()
        }

        // --- Vérifier que le service est enregistré ---
        const instance = this.registry.getInstance(serviceName, instanceId);

        if (!instance) throw ResponseException({error : "Service instance not registered"}).NotFound();

        // --- Rafraîchir le TTL (lease) ---
        const ttl = this.registry.updateHeartbeat(serviceName, instanceId);

        if (!ttl) throw ResponseException({error : "Failed to refresh lease"}).UnknownError();
            
        // --- Répondre au service ---
        throw ResponseException({
            status: "ok",
            message: "Heartbeat updated",
            ttl
        }).Success();
    });
}