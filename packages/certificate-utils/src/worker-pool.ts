import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { WorkerTaskQueue, type TaskEntry } from "./worker-task-queue";

export interface WorkerPoolOptions {
	size?: number;
	workerScript?: string;
	maxQueueSize?: number;
}

interface WorkerEntry {
	worker: import("node:worker_threads").Worker;
	busy: boolean;
}

export class WorkerPool {
	private readonly _workers: WorkerEntry[] = [];
	private readonly _taskQueue: WorkerTaskQueue;
	private readonly _workerScript: string;
	private readonly _poolSize: number;
	private _started = false;
	private _terminated = false;

	constructor(options: WorkerPoolOptions = {}) {
		this._poolSize = options.size ?? availableParallelism();
		this._taskQueue = new WorkerTaskQueue(options.maxQueueSize);
		this._workerScript =
			options.workerScript ?? join(__dirname, "worker-script.js");
	}

	/** Start workers if not already started — idempotent. */
	start(): void {
		this._ensureStarted();
	}

	execute<TValue>(
		type: string,
		data: Record<string, unknown>,
	): Promise<TValue> {
		if (this._terminated) {
			return Promise.reject(new Error("WorkerPool is terminated"));
		}

		this._ensureStarted();

		return this._taskQueue.enqueue(type, data, (task) =>
			this._tryDispatch(task),
		) as Promise<TValue>;
	}

	get pending(): number {
		return this._taskQueue.pending;
	}

	get active(): number {
		return this._taskQueue.active;
	}

	get size(): number {
		return this._workers.length;
	}

	async terminate(): Promise<void> {
		this._terminated = true;
		this._taskQueue.rejectAll("WorkerPool terminated");
		this._taskQueue.clear();
		await this._terminateAllWorkers();
		this._workers.length = 0;
	}

	private async _terminateAllWorkers(): Promise<void> {
		for (const workerEntry of this._workers) {
			workerEntry.worker.removeAllListeners();
		}
		await Promise.all(
			this._workers.map((workerEntry) => workerEntry.worker.terminate()),
		);
	}

	private _ensureStarted(): void {
		if (this._started) {
			return;
		}
		this._started = true;

		for (let i = 0; i < this._poolSize; i++) {
			this._spawnWorker();
		}
	}

	private _onWorkerMessage(
		entry: WorkerEntry,
		msg: {
			id: string;
			success: boolean;
			data?: unknown;
			error?: string;
		},
	): void {
		entry.busy = false;
		this._taskQueue.resolveTask(msg.id, msg.success, msg.data, msg.error);
		this._taskQueue.processQueue((task) => this._tryDispatch(task));
	}

	private _onWorkerError(entry: WorkerEntry): void {
		entry.busy = false;
		this._taskQueue.decrementActive();
		this._replaceWorker(entry);
	}

	private _onWorkerExit(entry: WorkerEntry, code: number): void {
		entry.busy = false;
		if (code !== 0 && !this._terminated) {
			this._taskQueue.decrementActive();
			this._replaceWorker(entry);
		}
	}

	private _spawnWorker(): void {
		const worker = new Worker(this._workerScript);
		const entry: WorkerEntry = { worker, busy: false };

		worker.on("message", (msg) => this._onWorkerMessage(entry, msg));
		worker.on("error", () => this._onWorkerError(entry));
		worker.on("exit", (code) => this._onWorkerExit(entry, code));

		this._workers.push(entry);
	}

	private _replaceWorker(entry: WorkerEntry): void {
		const idx = this._workers.indexOf(entry);
		if (idx !== -1) {
			entry.worker.removeAllListeners();
			this._workers.splice(idx, 1);
			if (!this._terminated) {
				this._spawnWorker();
			}
		}
	}

	private _tryDispatch(task: TaskEntry): boolean {
		const idleWorker = this._workers.find(
			(workerEntry) => !workerEntry.busy,
		);
		if (!idleWorker) {
			return false;
		}
		this._dispatch(idleWorker, task);
		return true;
	}

	private _dispatch(entry: WorkerEntry, task: TaskEntry): void {
		entry.busy = true;
		entry.worker.postMessage({
			id: task.id,
			type: task.type,
			data: task.data,
		});
	}
}
