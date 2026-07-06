import { randomUUID } from "node:crypto";

export interface TaskEntry {
	id: string;
	type: string;
	data: Record<string, unknown>;
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
}

export class WorkerTaskQueue {
	private readonly _pendingTasks = new Map<string, TaskEntry>();
	private readonly _queue: TaskEntry[] = [];
	private readonly _maxQueueSize: number;
	private _activeCount = 0;

	constructor(maxQueueSize?: number) {
		this._maxQueueSize = maxQueueSize ?? Number.POSITIVE_INFINITY;
	}

	enqueue(
		type: string,
		data: Record<string, unknown>,
		onDispatch: (task: TaskEntry) => boolean,
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
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

			if (onDispatch(entry)) {
				this._activeCount++;
			} else {
				this._queue.push(entry);
			}
		});
	}

	resolveTask(
		id: string,
		success: boolean,
		data?: unknown,
		error?: string,
	): void {
		const task = this._pendingTasks.get(id);
		if (task) {
			this._pendingTasks.delete(id);
			this._activeCount--;
			if (success) {
				task.resolve(data);
			} else {
				task.reject(new Error(error ?? "Unknown worker error"));
			}
		}
	}

	processQueue(onDispatch: (task: TaskEntry) => boolean): void {
		while (this._queue.length > 0) {
			const task = this._queue[0];
			if (!onDispatch(task)) {
				break;
			}
			this._queue.shift();
			this._activeCount++;
		}
	}

	decrementActive(): void {
		this._activeCount--;
	}

	rejectAll(message: string): void {
		for (const entry of this._queue) {
			entry.reject(new Error(message));
		}
		for (const entry of this._pendingTasks.values()) {
			entry.reject(new Error(message));
		}
	}

	clear(): void {
		this._queue.length = 0;
		this._pendingTasks.clear();
		this._activeCount = 0;
	}

	get pending(): number {
		return this._queue.length;
	}

	get active(): number {
		return this._activeCount;
	}
}
