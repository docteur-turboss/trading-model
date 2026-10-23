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

export interface PrioritizedSample {
	experiences: Experience[];
	/** Pool ids of the sampled experiences, to feed back into `updatePriorities`. */
	ids: number[];
	/** Importance-sampling weights, aligned with `experiences`. */
	weights: Float32Array;
}

export interface IPrioritizedExperiencePool extends IExperiencePool {
	/** Draws `batchSize` experiences with replacement, proportionally to P(i). */
	sampleWithWeights(batchSize: number): PrioritizedSample;
	/** Sets p_i = |δ_i| + ε for each sampled id; unknown ids are ignored. */
	updatePriorities(ids: readonly number[], tdErrors: readonly number[]): void;
}

export interface PerConfig {
	alpha: number;
	beta: number;
	betaAnneal: boolean;
	/** Linear increment applied to beta after each sample. @default 1e-4 */
	betaAnnealRate?: number;
}

const PRIORITY_EPSILON = 1e-6;
const DEFAULT_BETA_ANNEAL_RATE = 1e-4;

const DISABLED_POOL: IExperiencePool = {
	add: () => {},
	getPool: () => [],
	getPoolSize: () => 0,
	samplePool: () => [],
	clearPool: () => {},
	remove: () => {},
	values: () => new Map().values(),
};

class ExperiencePool implements IExperiencePool {
	private _poolMap = new Map<number, Experience>();
	private _poolInputToId = new WeakMap<Float32Array, number>();
	protected _nextPoolId = 0;
	private readonly _poolMaxSize: number;
	protected readonly _rng: () => number;

	constructor(poolMaxSize: number, rng: () => number) {
		this._poolMaxSize = poolMaxSize;
		this._rng = rng;
	}

	/** Hook for subclasses keeping per-experience state keyed by pool id. */
	protected _onRemoved(_id: number): void {}

	private _evictOldest(): void {
		const firstKey = this._firstMapKey();
		const oldest = this._poolMap.get(firstKey);
		this._poolMap.delete(firstKey);
		this._poolInputToId.delete(oldest!.input);
		this._onRemoved(firstKey);
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

	protected getPoolMap(): Map<number, Experience> {
		return this._poolMap;
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
			const j = Math.floor(this._rng() * (i + 1));
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
			this._onRemoved(id);
		}
	}

	public values(): MapIterator<Experience> {
		return this._poolMap.values();
	}
}

/**
 * Proportional Prioritized Experience Replay (Schaul et al., 2016).
 *
 * - Experience i is drawn, with replacement, with probability
 *   P(i) = p_i^α / Σ_j p_j^α.
 * - New experiences get the highest priority seen so far, so each one is
 *   likely to be replayed at least once before its TD error is known.
 * - `updatePriorities` sets p_i = |δ_i| + ε from the TD errors of a batch.
 * - Each draw carries an importance-sampling weight
 *   w_i = (N · P(i))^-β / max_j w_j, the maximum taken over the whole pool
 *   (i.e. at the least likely experience), so weights lie in (0, 1].
 * - With `betaAnneal`, beta grows linearly by `betaAnnealRate` after each
 *   sample, capped at 1 (full bias correction).
 */
class PrioritizedExperiencePool
	extends ExperiencePool
	implements IPrioritizedExperiencePool
{
	private readonly _priorities = new Map<number, number>();
	private _maxPriority = 1.0;
	private _beta: number;

	constructor(
		poolMaxSize: number,
		private readonly _per: PerConfig,
		rng: () => number
	) {
		super(poolMaxSize, rng);
		this._beta = _per.beta;
	}

	public add(experience: Experience): void {
		super.add(experience);
		this._priorities.set(this._nextPoolId - 1, this._maxPriority);
	}

	public updatePriorities(
		ids: readonly number[],
		tdErrors: readonly number[]
	): void {
		if (ids.length !== tdErrors.length) {
			throw agentError(
				`Got ${tdErrors.length} TD errors for ${ids.length} experiences.`
			);
		}
		ids.forEach((id, idx) => {
			if (!this._priorities.has(id)) {
				return;
			}
			const priority = Math.abs(tdErrors[idx]) + PRIORITY_EPSILON;
			this._priorities.set(id, priority);
			this._maxPriority = Math.max(this._maxPriority, priority);
		});
	}

	public sampleWithWeights(batchSize: number): PrioritizedSample {
		const entries = [...this.getPoolMap().entries()];
		if (entries.length === 0 || batchSize <= 0) {
			return { experiences: [], ids: [], weights: new Float32Array(0) };
		}

		const scaled = entries.map(
			([id]) =>
				(this._priorities.get(id) ?? this._maxPriority) ** this._per.alpha
		);
		const total = scaled.reduce((acc, val) => acc + val, 0);
		const count = entries.length;
		const minScaled = scaled.reduce((acc, val) => Math.min(acc, val));
		const maxWeight = ((count * minScaled) / total) ** -this._beta;

		const picks = Array.from({ length: batchSize }, () =>
			this._pickIndex(scaled, total)
		);
		const sample: PrioritizedSample = {
			experiences: picks.map((idx) => entries[idx][1]),
			ids: picks.map((idx) => entries[idx][0]),
			weights: Float32Array.from(
				picks,
				(idx) => ((count * scaled[idx]) / total) ** -this._beta / maxWeight
			),
		};
		this._advanceBeta();
		return sample;
	}

	public samplePool(batchSize: number): Experience[] {
		return this.sampleWithWeights(batchSize).experiences;
	}

	public clearPool(): void {
		super.clearPool();
		this._priorities.clear();
		this._maxPriority = 1.0;
	}

	protected _onRemoved(id: number): void {
		this._priorities.delete(id);
	}

	private _pickIndex(scaled: number[], total: number): number {
		const roll = this._rng() * total;
		let cumulative = 0;
		for (let idx = 0; idx < scaled.length; idx++) {
			cumulative += scaled[idx];
			if (roll < cumulative) {
				return idx;
			}
		}
		// Floating-point rounding can leave roll just above the last bound.
		return scaled.length - 1;
	}

	private _advanceBeta(): void {
		if (!this._per.betaAnneal) {
			return;
		}
		const rate = this._per.betaAnnealRate ?? DEFAULT_BETA_ANNEAL_RATE;
		this._beta = Math.min(1, this._beta + rate);
	}
}

export function createPrioritizedExperiencePool(
	poolMaxSize: number,
	perConfig: PerConfig,
	rng: () => number = Math.random
): IPrioritizedExperiencePool {
	return new PrioritizedExperiencePool(poolMaxSize, perConfig, rng);
}

export function createExperiencePool(
	enablePool: boolean,
	poolMaxSize: number,
	perConfig?: PerConfig & { prioritized: boolean },
	rng: () => number = Math.random
): IExperiencePool {
	if (!enablePool) {
		return DISABLED_POOL;
	}
	if (perConfig?.prioritized) {
		return createPrioritizedExperiencePool(poolMaxSize, perConfig, rng);
	}
	return new ExperiencePool(poolMaxSize, rng);
}
