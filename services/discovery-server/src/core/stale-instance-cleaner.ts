import { logger } from "@trading-model/common/config/logger";
import { toServiceId } from "@trading-model/common/domain/primitives";
import type {
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

import { isAliveInstance, isExpiredInstance } from "./expiration";

export interface CleanupDeps {
	listServiceNames(): Promise<string[]>;
	getInstances(serviceName: string): Promise<ServiceInstance[]>;
	removeInstance(id: ServiceIdentity): Promise<boolean>;
}

export class StaleInstanceCleaner {
	private readonly _handle = new TimerHandle();

	get isRunning(): boolean {
		return this._handle.isRunning;
	}

	constructor(
		private readonly _deps: CleanupDeps,
		private readonly _intervalMs: number,
	) {}

	start(): void {
		const initialDelay = Math.floor(Math.random() * this._intervalMs);
		setTimeout(() => {
			this._handle.startInterval(() => {
				this._cleanup().catch((err) => {
					logger.error("Redis cleanup error", {
						error: normalizeError(err),
					});
				});
			}, this._intervalMs);
		}, initialDelay);
	}

	stop(): void {
		this._handle.stop();
	}

	async cleanupNow(): Promise<void> {
		await this._cleanup();
	}

	async removeStaleInstances(): Promise<number> {
		const before = await this._deps.listServiceNames();
		await this._cleanup();
		const after = await this._deps.listServiceNames();
		return before.length - after.length;
	}

	isAlive(instance: ServiceInstance): boolean {
		return isAliveInstance(instance);
	}

	private async _removeExpiredInstance(serviceName: string, instance: ServiceInstance, now: number): Promise<void> {
		logger.warn("Expired instance removed", {
			serviceName, instanceId: instance.instanceId, heartbeatAge: now - instance.lastHeartbeat, ttl: instance.ttl,
		});
		await this._deps.removeInstance({ serviceName: toServiceId(serviceName), instanceId: instance.instanceId });
	}

	private async _cleanup(): Promise<void> {
		const now = Date.now();
		const serviceNames = await this._deps.listServiceNames();
		for (const serviceName of serviceNames) {
			const instances = await this._deps.getInstances(serviceName);
			for (const instance of instances) {
				if (isExpiredInstance(instance, now)) {
					await this._removeExpiredInstance(serviceName, instance, now);
				}
			}
		}
	}
}
