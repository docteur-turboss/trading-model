import { ResponseException } from "cash-lib/middleware/responseException";
import { catchSync } from "cash-lib/middleware/catchError";
import { ServiceRegistry } from "../core/ServiceRegistry";
import { ServiceRegisterPayload } from "../core/types";
import { logger } from "cash-lib/config/logger";

export class RegisterController {
    constructor(
        private registry: ServiceRegistry,
    ) {}

    /**
     * POST /register
     *
     * A microservice calls this endpoint when it starts.
     * It registers itself by sending its name, address, port, protocol,
     * and optional metadata.
     *
     * Responsibilities:
     *  - validate input
     *  - normalize metadata
     *  - register instance in registry
     *  - create lease (time-to-live)
     *  - return the created instance ID + expiration
     */
    register = catchSync(async (req) => {
        const body = req.body as Partial<ServiceRegisterPayload>;

        // --- Validation basique ---
        const missing = ["name", "address", "port", "protocol"].filter(
            (key) => !body[key as keyof ServiceRegisterPayload]
        );

        if (missing.length > 0) throw ResponseException({error : `Missing fields: ${missing.join(", ")}`}).BadRequest();

        // --- Payload normalizer ---
        const payload: ServiceRegisterPayload = {
            name: `${body.name!}`.trim(),
            address: `${body.address!}`.trim(),
            port: Number(body.port),
            protocol: `${body.protocol!}`.toLowerCase() as ServiceRegisterPayload["protocol"],
            metadata: body.metadata ?? {},
            env: body.env? `${body.env}` : process.env.NODE_ENV ?? "unknown",
            role: body.role ? `${body.role}` : null
        };

        // CTO-style logging for diagnostics
        logger.info(
            `[Register] Registering instance of service "${payload.name}" on ${payload.address}:${payload.port}`
        );

        const idGenerated = this.registry.generateInstanceId(payload.name, payload.address, payload.port);

        // --- Appel au registry (core) ---
        const instance = this.registry.registerInstance({
            protocol: payload.protocol, 
            metadata: payload.metadata, 
            serviceName: payload.name, 
            registeredAt: Date.now(), 
            instanceId: idGenerated,
            ip: payload.address,
            port: payload.port, 
            role: payload.role,
            lastHeartbeat: 0, 
            env: payload.env,
            ttl: 20_000,
        });

        logger.debug(
            `[Register] Lease created for ${instance.instanceId} (TTL ${instance.ttl} ms)`
        );

        throw ResponseException({
            instanceId: instance.instanceId,
            service: instance.serviceName,
            leaseExpiresAt: new Date(Date.now() + (instance.ttl??0)).toISOString(),
            ttl: instance.ttl,
            token: instance.token,
            message: "Service instance registered successfully"
        }).OK();
    })
}