import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { MemoryWalBuffer } from "./memory-wal-buffer";

interface DrainDeferred {
	promise: Promise<void>;
	resolve: () => void;
}

export enum DrainStateKind {
	Idle = "idle",
	Draining = "draining",
	DrainRequested = "drain-requested",
}

export class WalDrainCoordinator {
	private _drainState:
		| { kind: DrainStateKind.Idle }
		| { kind: DrainStateKind.Draining; deferred: DrainDeferred; timer: TimerHandle }
		| { kind: DrainStateKind.DrainRequested } = { kind: DrainStateKind.Idle };
	private _walFlushWaiters: Array<() => void> = [];

	constructor(
		private readonly _memoryWalBuffer: MemoryWalBuffer,
		private readonly _walKey: () => string,
		private readonly _performFlush: () => Promise<void>
	) {}

	get isDrainRequested(): boolean {
		return this._drainState.kind !== DrainStateKind.Idle;
	}

	async drain(timeoutMs = 10_000): Promise<void> {
		if (this._drainState.kind !== DrainStateKind.Idle) {
			return;
		}
		this._drainState = { kind: DrainStateKind.DrainRequested };
		try {
			const done = await this._tryDrainAll();
			if (done) {
				return;
			}
			await this._performFlush();
			return this._waitForDrainComplete(timeoutMs);
		} finally {
			if (this._drainState.kind === DrainStateKind.DrainRequested) {
				this._drainState = { kind: DrainStateKind.Idle };
			}
		}
	}

	private _waitForDrainComplete(timeoutMs: number): Promise<void> {
		let resolveDeferred: (() => void) | undefined;
		const deferred = new Promise<void>((resolve) => {
			resolveDeferred = resolve;
		});
		const timer = new TimerHandle();
		timer.startTimeout(() => {
			if (this._drainState.kind === DrainStateKind.Draining) {
				logger.warn(`WAL drain timed out after ${timeoutMs}ms`);
				this._drainState = { kind: DrainStateKind.Idle };
				resolveDeferred!();
			}
		}, timeoutMs);
		this._drainState = {
			kind: DrainStateKind.Draining,
			deferred: { promise: deferred, resolve: resolveDeferred! },
			timer,
		};
		return deferred;
	}

	async drainOnStartup(): Promise<void> {
		await this._recoverFallback();
		await this._drainExistingWal();
	}
	resolveDrain(): void {
		if (this._drainState.kind === DrainStateKind.Draining) {
			this._drainState.timer.stop();
			this._drainState.deferred.resolve();
			this._drainState = { kind: DrainStateKind.Idle };
		}
	}
	notifyWaiters(): void {
		const waiters = this._walFlushWaiters.splice(0);
		for (const waiter of waiters) {
			try {
				waiter();
			} catch {
				logger.debug("Waiter callback failed (best-effort)");
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
			logger.debug("WAL fallback recovery failed (best-effort)");
		}
	}
	private async _drainExistingWal(): Promise<void> {
		try {
			const redis = await getStreamClient();
			const len = await redis.llen(this._walKey());
			if (len > 0) {
				logger.info(
					`WAL buffer has ${len} pending entries from previous run — draining`
				);
				await this._performFlush();
			}
		} catch {
			logger.debug("Redis not available for WAL drain");
		}
	}
	private async _tryDrainAll(): Promise<boolean> {
		await this._memoryWalBuffer.drainAll();
		const redis = await getStreamClient();
		const remaining = await redis.llen(this._walKey());
		return remaining === 0 && this._memoryWalBuffer.length === 0;
	}
}
