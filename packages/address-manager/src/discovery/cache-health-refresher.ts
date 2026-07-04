import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
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

	private async _doExecute(): Promise<void> {
		const entries = await this._serviceCache.entries();
		if (entries.length === 0) {
			return;
		}

		if (entries.length !== this._previousEntriesLength) {
			this._offset = 0;
			this._previousEntriesLength = entries.length;
		}

		const fraction = Math.max(1, Math.floor(entries.length / 3));
		if (this._offset >= entries.length) {
			this._offset = 0;
		}

		const toCheck = entries.slice(this._offset, this._offset + fraction);
		this._offset = (this._offset + fraction) % entries.length;

		const ConcurrencyLimit = 10;
		const errors: PromiseRejectedResult[] = [];

		for (let i = 0; i < toCheck.length; i += ConcurrencyLimit) {
			const chunk = toCheck.slice(i, i + ConcurrencyLimit);
			const results = await Promise.allSettled(
				chunk.map(async ({ serviceName, instance }) => {
					const healthy = await this._healthChecker.isHealthy(instance);
					if (!healthy) {
						await this._serviceCache.invalidate(serviceName);
						logger.warn(
							"Cache health refresher invalidated unhealthy service",
							{ serviceName }
						);
					}
				})
			);

			for (const result of results) {
				if (result.status === "rejected") {
					errors.push(result);
				}
			}
		}

		for (const error of errors) {
			logger.error("Cache health refresher check failed", {
				error: normalizeError(error.reason),
			});
		}
	}
}
