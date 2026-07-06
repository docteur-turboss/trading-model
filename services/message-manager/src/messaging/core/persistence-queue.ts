import { logger } from "@trading-model/common/config/logger";

interface PersistenceOp {
	fn: () => Promise<void>;
	retries: number;
	label: string;
}

/**
 * Self-contained retry queue for persistence operations (subscribe/unsubscribe).
 * Manages its own timer, batch flush, and per-operation retry tracking.
 */
export class PersistenceRetryQueue {
	private _ops: PersistenceOp[] = [];
	private _timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly _maxRetries: number,
		private readonly _retryIntervalMs: number
	) {}

	enqueue(fn: () => Promise<void>, label: string): void {
		this._ops.push({ fn, retries: 0, label });
		this._ensureStarted();
	}

	private _ensureStarted(): void {
		if (this._timer) {
			return;
		}
		this._timer = setInterval(() => {
			this.flush().catch(() => {});
		}, this._retryIntervalMs);
		this._timer.unref();
	}

	async flush(): Promise<void> {
		if (this._shouldStopEmpty()) {
			return;
		}
		const batch = this._swapOps();
		const failed = await this._executeBatch(batch);
		this._reEnqueueFailed(failed);
		this._stopIfEmpty();
	}

	private _shouldStopEmpty(): boolean {
		if (this._ops.length > 0) {
			return false;
		}
		if (this._timer) {
			clearInterval(this._timer);
			this._timer = null;
		}
		return true;
	}

	private _swapOps(): PersistenceOp[] {
		const batch = this._ops;
		this._ops = [];
		return batch;
	}

	private async _executeBatch(batch: PersistenceOp[]): Promise<PersistenceOp[]> {
		const failed: PersistenceOp[] = [];
		for (const op of batch) {
			try {
				await op.fn();
			} catch {
				if (op.retries < this._maxRetries) {
					failed.push({ ...op, retries: op.retries + 1 });
				} else {
					logger.error("Persistence operation failed after max retries — giving up", { label: op.label });
				}
			}
		}
		return failed;
	}

	private _reEnqueueFailed(failed: PersistenceOp[]): void {
		if (failed.length > 0) {
			this._ops.push(...failed);
		}
	}

	private _stopIfEmpty(): void {
		if (this._ops.length === 0 && this._timer) {
			clearInterval(this._timer);
			this._timer = null;
		}
	}

	async stop(): Promise<void> {
		if (this._timer) {
			clearInterval(this._timer);
			this._timer = null;
		}
		await this.flush();
	}
}
