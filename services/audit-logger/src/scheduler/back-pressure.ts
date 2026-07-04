export class BackPressure {
	private _queueDepth = 0;
	private readonly _workerLoads: Map<string, number> = new Map();

	constructor(
		private readonly _maxQueueDepth: number,
		private readonly _maxWorkerLoadRatio: number
	) {}

	updateQueueDepth(depth: number): void {
		this._queueDepth = depth;
	}

	updateWorkerLoad(workerId: string, load: number): void {
		this._workerLoads.set(workerId, load);
	}

	removeWorker(workerId: string): void {
		this._workerLoads.delete(workerId);
	}

	canAccept(): boolean {
		if (this._queueDepth >= this._maxQueueDepth) {
			return false;
		}
		if (this._workerLoads.size === 0) {
			return true;
		}
		for (const load of this._workerLoads.values()) {
			if (load < this._maxWorkerLoadRatio) {
				return true;
			}
		}
		return false;
	}

	retryAfterSeconds(): number {
		return Math.ceil(this._queueDepth / 100) * 5;
	}
}
