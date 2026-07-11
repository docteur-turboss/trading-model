import { randomUUID } from "node:crypto";
import type { WorkerTaskType } from "../worker-task-type";

export type TaskType = WorkerTaskType;

export interface TaskEntry {
	id: string;
	type: TaskType;
	data: unknown;
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

	private _checkQueueCapacity(): void {
		if (this._queue.length >= this._maxQueueSize) {
			throw new Error("WorkerPool queue is full");
		}
	}

	private _createEntry(
		type: TaskType,
		data: unknown,
		resolve: (value: unknown) => void,
		reject: (reason: unknown) => void
	): TaskEntry {
		return {
			id: randomUUID(),
			type,
			data,
			resolve: resolve as (value: unknown) => void,
			reject,
		};
	}

	private _addToQueueOrDispatch(
		entry: TaskEntry,
		onDispatch: (task: TaskEntry) => boolean
	): void {
		this._pendingTasks.set(entry.id, entry);
		if (onDispatch(entry)) {
			this._activeCount++;
		} else {
			this._queue.push(entry);
		}
	}

	enqueue(
		type: TaskType,
		data: unknown,
		onDispatch: (task: TaskEntry) => boolean
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			this._checkQueueCapacity();
			const entry = this._createEntry(type, data, resolve, reject);
			this._addToQueueOrDispatch(entry, onDispatch);
		});
	}

	private _handleTaskOutcome(
		task: TaskEntry,
		success: boolean,
		data?: unknown,
		error?: string
	): void {
		if (success) {
			task.resolve(data);
		} else {
			task.reject(new Error(error ?? "Unknown worker error"));
		}
	}

	resolveTask(
		id: string,
		success: boolean,
		data?: unknown,
		error?: string
	): void {
		const task = this._pendingTasks.get(id);
		if (!task) {
			return;
		}
		this._pendingTasks.delete(id);
		this._activeCount--;
		this._handleTaskOutcome(task, success, data, error);
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
