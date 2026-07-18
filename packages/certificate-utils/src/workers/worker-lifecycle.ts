import { Worker } from "node:worker_threads";

export interface WorkerEntry {
	worker: import("node:worker_threads").Worker;
	busy: boolean;
}

export interface WorkerMessage {
	id: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

export interface WorkerLifecycleOptions {
	poolSize: number;
	workerScript: string;
	onMessage: (entry: WorkerEntry, msg: WorkerMessage) => void;
	onError: (entry: WorkerEntry) => void;
	onExit: (entry: WorkerEntry, code: number) => void;
}

export class WorkerLifecycle {
	private readonly _workers: WorkerEntry[] = [];
	private readonly _poolSize: number;
	private readonly _workerScript: string;
	private _started = false;
	private _terminated = false;
	private readonly _onMessage: (entry: WorkerEntry, msg: WorkerMessage) => void;
	private readonly _onError: (entry: WorkerEntry) => void;
	private readonly _onExit: (entry: WorkerEntry, code: number) => void;

	constructor(options: WorkerLifecycleOptions) {
		this._poolSize = options.poolSize;
		this._workerScript = options.workerScript;
		this._onMessage = options.onMessage;
		this._onError = options.onError;
		this._onExit = options.onExit;
	}

	get size(): number {
		return this._workers.length;
	}

	get terminated(): boolean {
		return this._terminated;
	}

	markTerminated(): void {
		this._terminated = true;
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

	releaseWorker(entry: WorkerEntry): void {
		entry.busy = false;
	}

	dispatchTask(task: { id: string; type: string; data: unknown }): boolean {
		const idleWorker = this.findIdleWorker();
		if (!idleWorker) {
			return false;
		}
		idleWorker.busy = true;
		idleWorker.worker.postMessage({
			id: task.id,
			type: task.type,
			data: task.data,
		});
		return true;
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
