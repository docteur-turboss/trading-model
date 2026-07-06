import { AppError, ErrorCodes } from "@trading-model/common/utils/errors";

import type { Experience } from "./type";

export class ExperiencePool {
	private _poolMap = new Map<number, Experience>();
	private _poolInputToId = new WeakMap<Float32Array, number>();
	private _nextPoolId = 0;
	private readonly _poolMaxSize: number;
	private readonly _enablePool: boolean;

	constructor(enablePool: boolean, poolMaxSize: number) {
		this._enablePool = enablePool;
		this._poolMaxSize = poolMaxSize;
	}

	public add(experience: Experience): void {
		if (!this._enablePool) {
			return;
		}
		const id = this._nextPoolId++;
		this._poolMap.set(id, experience);
		this._poolInputToId.set(experience.input, id);
		if (this._poolMap.size > this._poolMaxSize) {
			const firstKey = this._poolMap.keys().next().value!;
			const oldest = this._poolMap.get(firstKey);
			this._poolMap.delete(firstKey);
			this._poolInputToId.delete(oldest!.input);
		}
	}

	public getPool(): Experience[] {
		return [...this._poolMap.values()];
	}

	public getPoolSize(): number {
		return this._poolMap.size;
	}

	public samplePool(batchSize: number): Experience[] {
		const entries = [...this._poolMap.values()];
		if (batchSize > entries.length) {
			throw new AppError(
				`Requested batch size ${batchSize} exceeds pool size ${entries.length}.`,
				ErrorCodes.AGENT_ERROR,
			);
		}

		for (let i = entries.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[entries[i], entries[j]] = [entries[j], entries[i]];
		}
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
