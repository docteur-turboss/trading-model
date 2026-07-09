import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ServiceRegistry } from "./service-registry";
import { StaleInstanceCleaner } from "./stale-instance-cleaner";

export class ExpiredInstanceCleaner {
	constructor(private readonly _registry: ServiceRegistry) {}

	cleanupExpiredInstances(): void {
		StaleInstanceCleaner.cleanupSync({
			listServiceNames: () => this._registry.listServiceNames(),
			getInstances: (name) => this._registry.getInstances(name),
			removeInstance: (id) => {
				try {
					this._registry.removeInstance(id);
				} catch (err) {
					logger.error("Failed to remove expired instance", {
						serviceName: id.serviceName,
						instanceId: id.instanceId,
						error: normalizeError(err),
					});
				}
			},
		});
	}
}
