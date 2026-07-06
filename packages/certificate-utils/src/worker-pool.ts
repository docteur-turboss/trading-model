import { randomUUID } from "node:crypto";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

export interface WorkerPoolOptions {
	size?: number;
	workerScript?: string;
	maxQueueSize?: number;
}

interface TaskEntry {
	id: string;
	type: string;
	data: Record<string, unknown>;
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
}

interface WorkerEntry {
	worker: import("node:worker_threads").Worker;
	busy: boolean;
}

export class WorkerPool {
	private readonly _workers: WorkerEntry[] = [];
	private readonly _pendingTasks = new Map<string, TaskEntry>();
	private readonly _queue: TaskEntry[] = [];
	private readonly _workerScript: string;
	private readonly _poolSize: number;
	private readonly _maxQueueSize: number;
	private _started = false;
	private _terminated = false;

	constructor(options: WorkerPoolOptions = {}) {
		this._poolSize = options.size ?? availableParallelism();
		this._maxQueueSize = options.maxQueueSize ?? Number.POSITIVE_INFINITY;
		this._workerScript =
			options.workerScript ?? join(__dirname, "worker-script.js");
	}

	/** Start workers if not already started — idempotent. */
	start(): void {
		this._ensureStarted();
	}

	execute<TValue>(
		type: string,
		data: Record<string, unknown>
	): Promise<TValue> {
		return new Promise((resolve, reject) => {
			if (this._terminated) {
				reject(new Error("WorkerPool is terminated"));
				return;
			}

			this._ensureStarted();

			if (this._queue.length >= this._maxQueueSize) {
				reject(new Error("WorkerPool queue is full"));
				return;
			}

			const entry: TaskEntry = {
				id: randomUUID(),
				type,
				data,
				resolve: resolve as (value: unknown) => void,
				reject,
			};

			this._pendingTasks.set(entry.id, entry);

			const idleWorker = this._workers.find((workerEntry) => !workerEntry.busy);
			if (idleWorker) {
				this._dispatch(idleWorker, entry);
			} else {
				this._queue.push(entry);
			}
		});
	}

	get pending(): number {
		return this._queue.length;
	}

	get active(): number {
		return this._workers.filter((workerEntry) => workerEntry.busy).length;
	}

	get size(): number {
		return this._workers.length;
	}

	async terminate(): Promise<void> {
		this._terminated = true;

		for (const entry of this._queue) {
			entry.reject(new Error("WorkerPool terminated"));
		}
		this._queue.length = 0;

		for (const entry of this._pendingTasks.values()) {
			entry.reject(new Error("WorkerPool terminated"));
		}
		this._pendingTasks.clear();

		for (const workerEntry of this._workers) {
			workerEntry.worker.removeAllListeners();
		}
		await Promise.all(
			this._workers.map((workerEntry) => workerEntry.worker.terminate())
		);
		this._workers.length = 0;
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
		}
	): void {
		entry.busy = false;

		const task = this._pendingTasks.get(msg.id);
		if (task) {
			this._pendingTasks.delete(msg.id);
			if (msg.success) {
				task.resolve(msg.data);
			} else {
				task.reject(new Error(msg.error ?? "Unknown worker error"));
			}
		}

		this._processQueue();
	}

	private _onWorkerError(entry: WorkerEntry): void {
		entry.busy = false;
		this._replaceWorker(entry);
	}

	private _onWorkerExit(entry: WorkerEntry, code: number): void {
		entry.busy = false;
		if (code !== 0 && !this._terminated) {
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

	private _dispatch(entry: WorkerEntry, task: TaskEntry): void {
		entry.busy = true;
		entry.worker.postMessage({
			id: task.id,
			type: task.type,
			data: task.data,
		});
	}

	private _processQueue(): void {
		while (this._queue.length > 0) {
			const idleWorker = this._workers.find((workerEntry) => !workerEntry.busy);
			if (!idleWorker) {
				break;
			}

			const next = this._queue.shift()!;
			this._dispatch(idleWorker, next);
		}
	}
}
