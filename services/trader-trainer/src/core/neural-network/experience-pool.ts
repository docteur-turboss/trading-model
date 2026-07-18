import { agentError } from "@trading-model/common/utils/errors";

import type { Experience } from "./type";

export interface IExperiencePool {
	add(experience: Experience): void;
	getPool(): Experience[];
	getPoolSize(): number;
	samplePool(batchSize: number): Experience[];
	clearPool(): void;
	remove(input: Float32Array): void;
	values(): MapIterator<Experience>;
}

const DISABLED_POOL: IExperiencePool = {
	add: () => {},
	getPool: () => [],
	getPoolSize: () => 0,
	samplePool: () => [],
	clearPool: () => {},
	remove: () => {},
	values: () => new Map().values(),
};

export class ExperiencePool implements IExperiencePool {
	private _poolMap = new Map<number, Experience>();
	private _poolInputToId = new WeakMap<Float32Array, number>();
	private _nextPoolId = 0;
	private readonly _poolMaxSize: number;

	constructor(poolMaxSize: number) {
		this._poolMaxSize = poolMaxSize;
	}

	private _evictOldest(): void {
		const firstKey = this._firstMapKey();
		const oldest = this._poolMap.get(firstKey);
		this._poolMap.delete(firstKey);
		this._poolInputToId.delete(oldest!.input);
	}

	private _firstMapKey(): number {
		for (const key of this._poolMap.keys()) {
			return key;
		}
		throw new Error(
			"unreachable: caller checks poolMap.size > 0 before eviction"
		);
	}

	public add(experience: Experience): void {
		const id = this._nextPoolId++;
		this._poolMap.set(id, experience);
		this._poolInputToId.set(experience.input, id);
		if (this._poolMap.size > this._poolMaxSize) {
			this._evictOldest();
		}
	}

	public getPool(): Experience[] {
		return [...this._poolMap.values()];
	}

	public getPoolSize(): number {
		return this._poolMap.size;
	}

	private _validateBatchSize(entries: Experience[], batchSize: number): void {
		if (batchSize > entries.length) {
			throw agentError(
				`Requested batch size ${batchSize} exceeds pool size ${entries.length}.`
			);
		}
	}

	private _shuffleEntries(entries: Experience[]): void {
		for (let i = entries.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[entries[i], entries[j]] = [entries[j], entries[i]];
		}
	}

	public samplePool(batchSize: number): Experience[] {
		const entries = [...this._poolMap.values()];
		this._validateBatchSize(entries, batchSize);
		this._shuffleEntries(entries);
		return entries.slice(0, batchSize);
	}

	public clearPool(): void {
		this._poolMap.clear();
		this._poolInputToId = new WeakMap();
	}

	public remove(input: Float32Array): void {
		const id = this._poolInputToId.get(input);
		if (id !== undefined) {
			this._poolMap.delete(id);
			this._poolInputToId.delete(input);
		}
	}

	public values(): MapIterator<Experience> {
		return this._poolMap.values();
	}
}

export function createExperiencePool(
	enablePool: boolean,
	poolMaxSize: number
): IExperiencePool {
	if (!enablePool) {
		return DISABLED_POOL;
	}
	return new ExperiencePool(poolMaxSize);
}
