import { logger } from "@trading-model/common/config/logger";
import { type ServiceId, toServiceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "../client/type";
import type { ScheduledJob } from "../scheduler/scheduler";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceHealthChecker } from "./service-health-checker";

function selectBatchSlice(
	entries: { serviceName: ServiceId; instance: ServiceInstance }[],
	offset: number
): {
	batch: { serviceName: ServiceId; instance: ServiceInstance }[];
	nextOffset: number;
} {
	if (entries.length === 0) {
		return { batch: [], nextOffset: 0 };
	}
	const fraction = Math.max(1, Math.floor(entries.length / 3));
	const safeOffset = offset >= entries.length ? 0 : offset;
	const batch = entries.slice(safeOffset, safeOffset + fraction);
	const nextOffset = (safeOffset + fraction) % entries.length;
	return { batch, nextOffset };
}

export class CacheHealthRefresher implements ScheduledJob {
	public readonly schedule: string;
	private _batchOffset = 0;
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

	private async _checkEntry(entry: {
		serviceName: ServiceId;
		instance: ServiceInstance;
	}): Promise<void> {
		const healthy = await this._healthChecker.isHealthy(entry.instance);
		if (!healthy) {
			await this._serviceCache.invalidate(toServiceId(entry.serviceName));
			logger.warn("Cache health refresher invalidated unhealthy service", {
				serviceName: entry.serviceName,
			});
		}
	}

	private async _executeBatch(
		batch: { serviceName: ServiceId; instance: ServiceInstance }[],
		concurrencyLimit: number
	): Promise<PromiseRejectedResult[]> {
		const errors: PromiseRejectedResult[] = [];
		for (let i = 0; i < batch.length; i += concurrencyLimit) {
			const chunk = batch.slice(i, i + concurrencyLimit);
			const results = await Promise.allSettled(
				chunk.map((entry) => this._checkEntry(entry))
			);
			errors.push(...this._collectRejections(results));
		}
		return errors;
	}

	private _collectRejections(
		results: PromiseSettledResult<void>[]
	): PromiseRejectedResult[] {
		return results.filter(
			(result): result is PromiseRejectedResult => result.status === "rejected"
		);
	}

	private async _doExecute(): Promise<void> {
		const entries = await this._serviceCache.entries();
		if (entries.length === 0) {
			return;
		}

		const { batch, nextOffset } = selectBatchSlice(entries, this._batchOffset);
		this._batchOffset = nextOffset;
		const errors = await this._executeBatch(batch, 10);
		this._logBatchErrors(errors);
	}

	private _logBatchErrors(errors: PromiseRejectedResult[]): void {
		for (const error of errors) {
			logger.error("Cache health refresher check failed", {
				error: normalizeError(error.reason),
			});
		}
	}
}
