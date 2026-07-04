import { AppError, ErrorCodes } from "@trading-model/common/utils/errors";

export class Semaphore {
	private _current = 0;
	private _queue: Array<() => void> = [];

	constructor(
		private _max: number,
		private _maxQueue: number = Number.POSITIVE_INFINITY
	) {}

	acquire(): Promise<void> {
		if (this._current < this._max) {
			this._current++;
			return Promise.resolve();
		}
		if (this._queue.length >= this._maxQueue) {
			throw new AppError(
				"Semaphore queue full — too many pending operations",
				ErrorCodes.BACKPRESSURE
			);
		}
		return new Promise<void>((resolve) => {
			this._queue.push(resolve);
		});
	}

	release(): void {
		const next = this._queue.shift();
		if (next) {
			queueMicrotask(next);
		} else {
			this._current = Math.max(0, this._current - 1);
		}
	}

	get waiting(): number {
		return this._queue.length;
	}

	get running(): number {
		return this._current;
	}

	async run<TData>(fn: () => Promise<TData>): Promise<TData> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}
}
