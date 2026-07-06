import { logger } from "@trading-model/common/config/logger";
import type {
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";

const CLOCK_SKEW_TOLERANCE_MS = 2000;

export interface CleanupDeps {
	listServiceNames(): Promise<string[]>;
	getInstances(serviceName: string): Promise<ServiceInstance[]>;
	removeInstance(id: ServiceIdentity): Promise<boolean>;
}

export class StaleInstanceCleaner {
	private _handle: NodeJS.Timeout | undefined;

	get isRunning(): boolean {
		return this._handle !== undefined;
	}

	constructor(
		private readonly _deps: CleanupDeps,
		private readonly _intervalMs: number,
	) {}

	start(): void {
		const initialDelay = Math.floor(Math.random() * this._intervalMs);
		setTimeout(() => {
			this._handle = setInterval(() => {
				this._cleanup().catch((err) => {
					logger.error("Redis cleanup error", {
						error: normalizeError(err),
					});
				});
			}, this._intervalMs);
		}, initialDelay);
	}

	stop(): void {
		if (this._handle) {
			clearInterval(this._handle);
			this._handle = undefined;
		}
	}

	async cleanupNow(): Promise<void> {
		await this._cleanup();
	}

	private async _cleanup(): Promise<void> {
		const now = Date.now();
		const serviceNames = await this._deps.listServiceNames();

		for (const serviceName of serviceNames) {
			const instances = await this._deps.getInstances(serviceName);

			for (const instance of instances) {
				if (
					now - instance.lastHeartbeat >
					instance.ttl + CLOCK_SKEW_TOLERANCE_MS
				) {
					logger.warn("Expired instance removed", {
						serviceName,
						instanceId: instance.instanceId,
						heartbeatAge: now - instance.lastHeartbeat,
						ttl: instance.ttl,
					});
					await this._deps.removeInstance({
						serviceName,
						instanceId: instance.instanceId,
					});
				}
			}
		}
	}
}
