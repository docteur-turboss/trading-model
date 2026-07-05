import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "../client/type";
import type { ScheduledJob } from "../scheduler/scheduler";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceHealthChecker } from "./service-health-checker";

export class CacheHealthRefresher implements ScheduledJob {
	public readonly schedule: string;
	private _offset = 0;
	private _previousEntriesLength = 0;
	private _running = false;

	constructor(
		private readonly _serviceCache: IServiceCache,
		private readonly _healthChecker: ServiceHealthChecker,
		checkIntervalMs: number
	) {
		this.schedule = `*/${Math.max(1, Math.floor(checkIntervalMs / 1000))} * * * * *`;
	}

	async execute(): Promise<void> {
		if (this._running) {
			logger.warn(
				"CacheHealthRefresher: previous execution still running, skipping tick"
			);
			return;
		}
		this._running = true;
		try {
			await this._doExecute();
		} finally {
			this._running = false;
		}
	}

	private _selectBatch(
		entries: { serviceName: string; instance: ServiceInstance }[]
	): { serviceName: string; instance: ServiceInstance }[] {
		if (entries.length !== this._previousEntriesLength) {
			this._offset = 0;
			this._previousEntriesLength = entries.length;
		}
		const fraction = Math.max(1, Math.floor(entries.length / 3));
		if (this._offset >= entries.length) {
			this._offset = 0;
		}
		const batch = entries.slice(this._offset, this._offset + fraction);
		this._offset = (this._offset + fraction) % entries.length;
		return batch;
	}

	private async _checkEntry(entry: {
		serviceName: string;
		instance: ServiceInstance;
	}): Promise<void> {
		const healthy = await this._healthChecker.isHealthy(entry.instance);
		if (!healthy) {
			await this._serviceCache.invalidate(entry.serviceName);
			logger.warn("Cache health refresher invalidated unhealthy service", {
				serviceName: entry.serviceName,
			});
		}
	}

	private async _executeBatch(
		batch: { serviceName: string; instance: ServiceInstance }[],
		concurrencyLimit: number
	): Promise<PromiseRejectedResult[]> {
		const errors: PromiseRejectedResult[] = [];
		for (let i = 0; i < batch.length; i += concurrencyLimit) {
			const chunk = batch.slice(i, i + concurrencyLimit);
			const results = await Promise.allSettled(
				chunk.map((entry) => this._checkEntry(entry))
			);
			for (const result of results) {
				if (result.status === "rejected") {
					errors.push(result);
				}
			}
		}
		return errors;
	}

	private async _doExecute(): Promise<void> {
		const entries = await this._serviceCache.entries();
		if (entries.length === 0) {
			return;
		}

		const batch = this._selectBatch(entries);
		const errors = await this._executeBatch(batch, 10);

		for (const error of errors) {
			logger.error("Cache health refresher check failed", {
				error: normalizeError(error.reason),
			});
		}
	}
}
