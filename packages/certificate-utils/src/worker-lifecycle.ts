import { Worker } from "node:worker_threads";

export interface WorkerEntry {
	worker: import("node:worker_threads").Worker;
	busy: boolean;
}

type WorkerMessage = {
	id: string;
	success: boolean;
	data?: unknown;
	error?: string;
};

export class WorkerLifecycle {
	private readonly _workers: WorkerEntry[] = [];
	private readonly _poolSize: number;
	private readonly _workerScript: string;
	private _started = false;
	private _terminated = false;
	private readonly _onMessage: (entry: WorkerEntry, msg: WorkerMessage) => void;
	private readonly _onError: (entry: WorkerEntry) => void;
	private readonly _onExit: (entry: WorkerEntry, code: number) => void;

	constructor(
		poolSize: number,
		workerScript: string,
		onMessage: (entry: WorkerEntry, msg: WorkerMessage) => void,
		onError: (entry: WorkerEntry) => void,
		onExit: (entry: WorkerEntry, code: number) => void
	) {
		this._poolSize = poolSize;
		this._workerScript = workerScript;
		this._onMessage = onMessage;
		this._onError = onError;
		this._onExit = onExit;
	}

	get size(): number {
		return this._workers.length;
	}

	get terminated(): boolean {
		return this._terminated;
	}

	set terminated(value: boolean) {
		this._terminated = value;
	}

	ensureStarted(): void {
		if (this._started) {
			return;
		}
		this._started = true;
		for (let i = 0; i < this._poolSize; i++) {
			this._spawnWorker();
		}
	}

	private _spawnWorker(): void {
		const worker = new Worker(this._workerScript);
		const entry: WorkerEntry = { worker, busy: false };

		worker.on("message", (msg) => this._onMessage(entry, msg as WorkerMessage));
		worker.on("error", () => this._onError(entry));
		worker.on("exit", (code) => this._onExit(entry, code));

		this._workers.push(entry);
	}

	replaceWorker(entry: WorkerEntry): void {
		const idx = this._workers.indexOf(entry);
		if (idx !== -1) {
			entry.worker.removeAllListeners();
			this._workers.splice(idx, 1);
			if (!this._terminated) {
				this._spawnWorker();
			}
		}
	}

	findIdleWorker(): WorkerEntry | undefined {
		return this._workers.find((workerEntry) => !workerEntry.busy);
	}

	async terminateAll(): Promise<void> {
		for (const workerEntry of this._workers) {
			workerEntry.worker.removeAllListeners();
		}
		await Promise.all(
			this._workers.map((workerEntry) => workerEntry.worker.terminate())
		);
	}
}
