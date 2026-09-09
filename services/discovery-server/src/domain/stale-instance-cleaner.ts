import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { DurationMs } from "@trading-model/common/domain/primitives";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { ServiceInstance } from "@trading-model/validation/adapters/outbound/service-registry.types";

import { isAliveInstance, isExpiredInstance } from "./expiration";

export interface CleanupDeps {
	listServiceNames(): Promise<ServiceInstanceName[]>;
	getInstances(serviceName: ServiceInstanceName): Promise<ServiceInstance[]>;
	removeInstance(id: ServiceIdentity): Promise<boolean>;
}

export interface SyncCleanupDeps {
	listServiceNames(): ServiceInstanceName[];
	getInstances(serviceName: ServiceInstanceName): ServiceInstance[];
	removeInstance(id: ServiceIdentity): void;
}

export class StaleInstanceCleaner {
	private readonly _handle = new TimerHandle();

	get isRunning(): boolean {
		return this._handle.isRunning;
	}

	constructor(
		private readonly _deps: CleanupDeps,
		private readonly _intervalMs: DurationMs
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

	static cleanupSync(deps: SyncCleanupDeps): void {
		const now = Date.now();
		for (const serviceName of deps.listServiceNames()) {
			for (const instance of deps.getInstances(serviceName)) {
				if (isExpiredInstance(instance, now)) {
					logger.warn("Expired instance removed", {
						serviceName,
						instanceId: instance.instanceId,
						heartbeatAge: now - instance.lastHeartbeat,
						ttl: instance.ttl,
					});
					deps.removeInstance({
						serviceName: toServiceId(serviceName),
						instanceId: toInstanceId(instance.instanceId),
					});
				}
			}
		}
	}

	private async _removeExpiredInstance(
		serviceName: ServiceInstanceName,
		instance: ServiceInstance,
		now: number
	): Promise<void> {
		logger.warn("Expired instance removed", {
			serviceName,
			instanceId: instance.instanceId,
			heartbeatAge: now - instance.lastHeartbeat,
			ttl: instance.ttl,
		});
		await this._deps.removeInstance({
			serviceName: toServiceId(serviceName),
			instanceId: toInstanceId(instance.instanceId),
		});
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
