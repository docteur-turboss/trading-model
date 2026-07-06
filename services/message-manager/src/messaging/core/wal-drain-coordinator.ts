import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { MemoryWalBuffer } from "./memory-wal-buffer";

export class WalDrainCoordinator {
	private _walDrainRequested = false;
	private _walDrainResolve: (() => void) | null = null;
	private _walDrainGen = 0;
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
		const gen = ++this._walDrainGen;

		try {
			const done = await this._tryDrainAll();
			if (done) {
				return;
			}
			await this._performFlush();
			return this._waitForDrainCompletion(gen, timeoutMs);
		} finally {
			this._walDrainRequested = false;
		}
	}

	async drainOnStartup(): Promise<void> {
		await this._recoverFallback();
		await this._drainExistingWal();
	}

	resolveDrain(): void {
		if (this._walDrainResolve) {
			const resolve = this._walDrainResolve;
			this._walDrainResolve = null;
			resolve();
		}
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

	private _waitForDrainCompletion(gen: number, timeoutMs: number): Promise<void> {
		return new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				if (this._walDrainGen === gen) {
					this._walDrainResolve = null;
					logger.warn(`WAL drain timed out after ${timeoutMs}ms`);
					resolve();
				}
			}, timeoutMs);
			this._walDrainResolve = () => {
				if (this._walDrainGen === gen) {
					clearTimeout(timer);
					this._walDrainResolve = null;
					resolve();
				}
			};
		});
	}
}
