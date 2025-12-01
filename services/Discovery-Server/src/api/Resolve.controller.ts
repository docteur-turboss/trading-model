import { ResponseException } from "cash-lib/middleware/responseException";
import { catchSync } from "cash-lib/middleware/catchError";
import { ServiceRegistry } from "../core/ServiceRegistry";
import { LeaseManager } from "../core/LeaseManager";
import { logger } from "cash-lib/config/logger";

/**
 * GET /resolve/:serviceName
 *
 * Returns a reachable instance of the requested service.
 * This controller performs:
 *  - Filtering by service name
 *  - Optional filtering by environment, role, version...
 *  - Lease validation (instance must be alive)
 *  - Simple selection strategy (round-robin or random)
 */
export class ResolveController {
    constructor(
        private registry: ServiceRegistry,
        private leaseManager: LeaseManager
    ) {}

    resolve = catchSync(async (req) => {
        const serviceName = req.params.serviceName?.trim();
        const { role, env, version } = req.query;

        if (!serviceName) throw ResponseException({error : "Missing service name in path."}).BadRequest();

        logger.debug(`[Resolve] Requesting service "${serviceName}"`);

        // --- Fetch instances from registry ---
        const instances = this.registry.getInstances(serviceName);

        if (!instances || instances.length === 0) throw ResponseException({error : `No instance registered for service "${serviceName}"`}).NotFound();

        // --- Filter based on criteria ---
        let filtered = instances;

        if (role) filtered = filtered.filter(i => i.role === role);
        if (env) filtered = filtered.filter(i => i.env === env);
        if (version) filtered = filtered.filter(i => i.metadata?.version === version);

        if (filtered.length === 0) throw ResponseException(JSON.stringify({
            error : `No instance matching criteria for service "${serviceName}"`,
            filters: { role, env, version }
        })).NotFound();

        // --- Lease / TTL validation ---
        const aliveInstances = filtered.filter(i => this.leaseManager.isAlive(i));

        if (aliveInstances.length === 0) throw ResponseException({error: `All instances are expired or unreachable for "${serviceName}".`}).Gone();

        // --- Apply selection strategy (Round-Robin by default) ---
        const selected = this.selectInstance(serviceName, aliveInstances);

        logger.info(
            `[Resolve] Selected instance ${selected.id} for service "${serviceName}" → ${selected.address}:${selected.port}`
        );

        // --- Return resolved address ---
        throw ResponseException({
            instanceId: selected.id,
            name: selected.name,
            address: selected.address,
            port: selected.port,
            protocol: selected.protocol,
            metadata: selected.metadata,
            role: selected.role,
            env: selected.env,
            resolvedAt: Date.now()
        }).Success()
  });

    /**
     * Default selection strategy: Round Robin
     * Could also be:
     *  - Random
     *  - Least connections
     *  - Health-based selection
     */
    private roundRobinIndex: Record<string, number> = {};

    private selectInstance(serviceName: string, instances: any[]) {
        const idx = this.roundRobinIndex[serviceName] ?? 0;

        const instance = instances[idx % instances.length];

        this.roundRobinIndex[serviceName] = (idx + 1) % instances.length;

        return instance;
    }
}