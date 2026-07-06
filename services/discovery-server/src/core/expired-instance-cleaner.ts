import { logger } from "@trading-model/common/config/logger";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { isExpiredInstance } from "./expiration";
import type { ServiceRegistry } from "./service-registry";
import type { ServiceInstance } from "./types";

export class ExpiredInstanceCleaner {
	constructor(private readonly _registry: ServiceRegistry) {}

	cleanupExpiredInstances(): void {
		const now = Date.now();
		for (const serviceName of this._registry.listServiceNames()) {
			for (const instance of this._registry.getInstances(serviceName)) {
				if (isExpiredInstance(instance, now)) {
					this._removeExpiredInstance(serviceName, instance);
				}
			}
		}
	}

	private _removeExpiredInstance(
		serviceName: string,
		instance: ServiceInstance
	): void {
		logger.warn("Expired instance removed", {
			serviceName,
			instanceId: instance.instanceId,
		});
		try {
			this._registry.removeInstance({
				serviceName: toServiceId(serviceName),
				instanceId: instance.instanceId,
			});
		} catch (err) {
			logger.error("Failed to remove expired instance", {
				serviceName,
				instanceId: instance.instanceId,
				error: normalizeError(err),
			});
		}
	}
}
