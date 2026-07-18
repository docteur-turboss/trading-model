import { availableParallelism } from "node:os";
import { join } from "node:path";
import {
	type WorkerEntry,
	WorkerLifecycle,
	type WorkerLifecycleOptions,
} from "./worker-lifecycle";
import {
	type TaskEntry,
	type TaskType,
	WorkerTaskQueue,
} from "./worker-task-queue";

export interface WorkerPoolOptions {
	size?: number;
	workerScript?: string;
	maxQueueSize?: number;
}

export class WorkerPool {
	private readonly _taskQueue: WorkerTaskQueue;
	private readonly _workerLifecycle: WorkerLifecycle;

	constructor(options: WorkerPoolOptions = {}) {
		const poolSize = options.size ?? availableParallelism();
		const workerScript =
			options.workerScript ?? join(__dirname, "worker-script.js");
		this._taskQueue = new WorkerTaskQueue(options.maxQueueSize);
		this._workerLifecycle = new WorkerLifecycle({
			poolSize,
			workerScript,
			onMessage: (entry, msg) => this._onWorkerMessage(entry, msg),
			onError: (entry) => this._onWorkerError(entry),
			onExit: (entry, code) => this._onWorkerExit(entry, code),
		} satisfies WorkerLifecycleOptions);
	}

	start(): void {
		this._workerLifecycle.ensureStarted();
	}

	private _rejectIfTerminated(): void {
		if (this._workerLifecycle.terminated) {
			throw new Error("WorkerPool is terminated");
		}
	}

	execute<TValue>(type: TaskType, data: unknown): Promise<TValue> {
		this._rejectIfTerminated();
		this._workerLifecycle.ensureStarted();
		return this._taskQueue.enqueue(type, data, (task) =>
			this._tryDispatch(task)
		) as Promise<TValue>;
	}

	get pending(): number {
		return this._taskQueue.pending;
	}

	get active(): number {
		return this._taskQueue.active;
	}

	get size(): number {
		return this._workerLifecycle.size;
	}

	async terminate(): Promise<void> {
		this._workerLifecycle.markTerminated();
		this._taskQueue.rejectAll("WorkerPool terminated");
		this._taskQueue.clear();
		await this._workerLifecycle.terminateAll();
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
		this._workerLifecycle.releaseWorker(entry);
		this._taskQueue.resolveTask(msg.id, msg.success, msg.data, msg.error);
		this._tryDispatchNext();
	}

	private _tryDispatchNext(): void {
		this._taskQueue.processQueue((task) => this._tryDispatch(task));
	}

	private _onWorkerError(entry: WorkerEntry): void {
		this._workerLifecycle.releaseWorker(entry);
		this._taskQueue.decrementActive();
		this._workerLifecycle.replaceWorker(entry);
	}

	private _onWorkerExit(entry: WorkerEntry, code: number): void {
		this._workerLifecycle.releaseWorker(entry);
		if (code !== 0 && !this._workerLifecycle.terminated) {
			this._taskQueue.decrementActive();
			this._workerLifecycle.replaceWorker(entry);
		}
	}

	private _tryDispatch(task: TaskEntry): boolean {
		return this._workerLifecycle.dispatchTask(task);
	}
}
