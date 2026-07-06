import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

interface DrainDeferred {
	promise: Promise<void>;
	resolve: () => void;
}

export class WalDrainCoordinator {
	private _walDrainRequested = false;
	private _pendingDrain: DrainDeferred | null = null;
	private readonly _drainTimer = new TimerHandle();
	private _walFlushWaiters: Array<() => void> = [];

	constructor(
		private readonly _memoryWalBuffer: MemoryWalBuffer,
		private readonly _walKey: () => string,
		private readonly _performFlush: () => Promise<void>,
	) {}

	get isDrainRequested(): boolean {
		return this._walDrainRequested;
	}

	async drain(timeoutMs = 10_000): Promise<void> {
		if (this._walDrainRequested) {
			return;
		}
		this._walDrainRequested = true;

		try {
			const done = await this._tryDrainAll();
			if (done) {
				return;
			}
			await this._performFlush();
			const deferred = Promise.withResolvers<void>();
			this._pendingDrain = deferred;
			this._drainTimer.startTimeout(() => {
				this._pendingDrain = null;
				logger.warn(`WAL drain timed out after ${timeoutMs}ms`);
				deferred.resolve();
			}, timeoutMs);
			return deferred.promise;
		} finally {
			this._walDrainRequested = false;
		}
	}

	async drainOnStartup(): Promise<void> {
		await this._recoverFallback();
		await this._drainExistingWal();
	}

	resolveDrain(): void {
		this._drainTimer.stop();
		const deferred = this._pendingDrain;
		this._pendingDrain = null;
		deferred?.resolve();
	}

	notifyWaiters(): void {
		const waiters = this._walFlushWaiters.splice(0);
		for (const waiter of waiters) {
			try {
				waiter();
			} catch {
				/* best-effort */
			}
		}
	}

	enqueueFlushWaiter(): Promise<void> {
		return new Promise<void>((resolve) => {
			this._walFlushWaiters.push(resolve);
		});
	}

	private async _recoverFallback(): Promise<void> {
		try {
			await this._memoryWalBuffer.recoverFromFallbackFile();
		} catch {
			// best-effort
		}
	}

	private async _drainExistingWal(): Promise<void> {
		try {
			const redis = await getStreamClient();
			const len = await redis.llen(this._walKey());
			if (len > 0) {
				logger.info(`WAL buffer has ${len} pending entries from previous run — draining`);
				await this._performFlush();
			}
		} catch {
			// Redis not available
		}
	}

	private async _tryDrainAll(): Promise<boolean> {
		await this._memoryWalBuffer.drainAll();
		const redis = await getStreamClient();
		const remaining = await redis.llen(this._walKey());
		return remaining === 0 && this._memoryWalBuffer.length === 0;
	}
}
