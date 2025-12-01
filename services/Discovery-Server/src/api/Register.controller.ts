import { ResponseException } from "cash-lib/middleware/responseException";
import { catchSync } from "cash-lib/middleware/catchError";
import { ServiceRegistry } from "../core/ServiceRegistry";
import { ServiceRegisterPayload } from "../core/types";
import { LeaseManager } from "../core/LeaseManager";
import { logger } from "cash-lib/config/logger";

export class RegisterController {
    constructor(
        private registry: ServiceRegistry,
        private leaseManager: LeaseManager
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

        // --- Appel au registry (core) ---
        const instance = this.registry.registerInstance({
            instanceId: `${payload.name}-${payload.address}:${payload.port}-${Date.now()}`,
            ip: payload.address,
            lastHeartbeat: 0, 
            port: payload.port, 
            protocol: payload.protocol, 
            registeredAt: Date.now(), 
            serviceName: payload.name, 
            metadata: payload.metadata, 
            ttl: 20_000,
            env: payload.env,
            role: payload.role
        });

        logger.debug(
            `[Register] Lease created for ${instance.instanceId} (TTL ${instance.ttl} ms)`
        );

        throw ResponseException({
            instanceId: instance.instanceId,
            service: instance.serviceName,
            leaseExpiresAt: new Date(Date.now() + instance.ttl).toISOString(),
            ttl: instance.ttl,
            message: "Service instance registered successfully"
        }).OK();
    })
}