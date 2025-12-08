import { ResponseException } from "cash-lib/middleware/responseException";
import { ServiceInstance, ServicesQueryPayload } from "../core/types";
import { catchSync } from "cash-lib/middleware/catchError";
import { ServiceRegistry } from "../core/ServiceRegistry";
import { LeaseManager } from "../core/LeaseManager";

export class ServicesQueryController {
    constructor(
        private registry: ServiceRegistry,
        private leaseManager: LeaseManager
    ) {}

    /**
     * POST /services
     * Query complex for services resolution.
     * Supports:
     * - Filtering by name
     * - Filtering by metadata
     * - Returning multiple services
     * - Excluding dead instances (TTL expired)
     */
    handle = catchSync((req, res) => {
        const { serviceName, services, metadata, onlyAlive = true } = req.body as Partial<ServicesQueryPayload>;

        let results: Record<string, ServiceInstance[]> = {};

        // --- Déterminer mode single ou multi-service ---
        const targetServices: string[] = [];

        if (serviceName) targetServices.push(serviceName);
        if (Array.isArray(services)) targetServices.push(...services);

        if (targetServices.length === 0) throw ResponseException({error : "You must provide serviceName or services[]"}).BadRequest();

        // --- Récupérer les instances vivantes ---
        targetServices.forEach(name => {
            let instances = this.registry.getInstances(name) || [];

            // Filtrer instances vivantes
            if (onlyAlive) instances = instances.filter(i => this.leaseManager.isAlive(i));
            // Filtrer via metadata
            if (metadata) instances = instances.filter(i => this.metadataMatch(i, metadata));

            results[name] = instances;
        });

        throw ResponseException({
            status: "ok",
            services: results
        }).OK();
    });

    /**
     * Vérifie que la metadata d’une instance contient 
     * toutes les propriétés demandées.
     */
    private metadataMatch(instance: ServiceInstance, filter: any): boolean {
        const meta = instance.metadata || {};
        return Object.keys(filter).every(key => meta[key] === filter[key]);
    }
}
