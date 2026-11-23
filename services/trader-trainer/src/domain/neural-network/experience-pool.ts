import { agentError } from "@trading-model/model-runtime/errors";

import type { Experience } from "@trading-model/model-runtime/neural-network/type";

export interface ExperiencePoolPort {
	add(experience: Experience): void;
	getPoolSize(): number;
	samplePool(batchSize: number): Experience[];
	clearPool(): void;
}

interface PrioritizedSample {
	experiences: Experience[];
	/** Pool ids of the sampled experiences, to feed back into `updatePriorities`. */
	ids: number[];
	/** Importance-sampling weights, aligned with `experiences`. */
	weights: Float32Array;
}

export interface PrioritizedExperiencePoolPort extends ExperiencePoolPort {
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

const DISABLED_POOL: ExperiencePoolPort = {
	add: () => {
		// Intentional no-op.
	},
	getPoolSize: () => 0,
	samplePool: () => [],
	clearPool: () => {
		// Intentional no-op.
	},
};

class ExperiencePool implements ExperiencePoolPort {
	private _poolMap = new Map<number, Experience>();
	protected _nextPoolId = 0;
	protected readonly _poolMaxSize: number;
	protected readonly _rng: () => number;

	constructor(poolMaxSize: number, rng: () => number) {
		this._poolMaxSize = poolMaxSize;
		this._rng = rng;
	}

	private _evictOldest(): void {
		// Map keeps insertion order: the first key is the oldest; add() calls this only when non-empty.
		const firstKey = this._poolMap.keys().next().value as number;
		this._poolMap.delete(firstKey);
	}

	public add(experience: Experience): void {
		const id = this._nextPoolId++;
		this._poolMap.set(id, experience);
		if (this._poolMap.size > this._poolMaxSize) {
			this._evictOldest();
		}
	}

	public getPoolSize(): number {
		return this._poolMap.size;
	}

	protected getPoolMap(): Map<number, Experience> {
		return this._poolMap;
	}

	/** Partial Fisher-Yates in O(batchSize): live ids are contiguous, so slot i is id `first + i`. */
	public samplePool(batchSize: number): Experience[] {
		const size = this._poolMap.size;
		if (batchSize > size) {
			throw agentError(
				`Requested batch size ${batchSize} exceeds pool size ${size}.`
			);
		}
		const first = this._nextPoolId - size;
		const swapped = new Map<number, number>();
		const batch: Experience[] = [];
		for (let i = 0; i < batchSize; i++) {
			const j = i + Math.floor(this._rng() * (size - i));
			const slot = swapped.get(j) ?? j;
			swapped.set(j, swapped.get(i) ?? i);
			batch.push(this._poolMap.get(first + slot) as Experience);
		}
		return batch;
	}

	public clearPool(): void {
		this._poolMap.clear();
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
	implements PrioritizedExperiencePoolPort
{
	/**
	 * Sum / min trees over p_i^α, one leaf per circular slot (`id % poolMaxSize`):
	 * a new id overwrites the slot of the evicted one. Node k has children 2k, 2k+1.
	 */
	private readonly _leafCount: number;
	private readonly _sum: Float64Array;
	private readonly _min: Float64Array;
	private _maxPriority = 1.0;
	private _beta: number;

	constructor(
		poolMaxSize: number,
		private readonly _per: PerConfig,
		rng: () => number
	) {
		super(poolMaxSize, rng);
		this._beta = _per.beta;
		this._leafCount = 2 ** Math.ceil(Math.log2(Math.max(1, poolMaxSize)));
		this._sum = new Float64Array(2 * this._leafCount);
		this._min = new Float64Array(2 * this._leafCount).fill(
			Number.POSITIVE_INFINITY
		);
	}

	public add(experience: Experience): void {
		super.add(experience);
		this._setLeaf(this._nextPoolId - 1, this._maxPriority ** this._per.alpha);
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
			if (!this.getPoolMap().has(id)) {
				return;
			}
			const priority = Math.abs(tdErrors[idx]) + PRIORITY_EPSILON;
			this._setLeaf(id, priority ** this._per.alpha);
			this._maxPriority = Math.max(this._maxPriority, priority);
		});
	}

	public sampleWithWeights(batchSize: number): PrioritizedSample {
		const count = this.getPoolSize();
		if (count === 0 || batchSize <= 0) {
			return { experiences: [], ids: [], weights: new Float32Array(0) };
		}

		const total = this._sum[1];
		const maxWeight = ((count * this._min[1]) / total) ** -this._beta;
		const first = this._nextPoolId - count;
		const experiences: Experience[] = [];
		const ids: number[] = [];
		const weights = new Float32Array(batchSize);
		for (let i = 0; i < batchSize; i++) {
			const leaf = this._pickLeaf(this._rng() * total);
			const slot = leaf - this._leafCount;
			const max = this._poolMaxSize;
			const id = first + ((slot - (first % max) + max) % max);
			ids.push(id);
			experiences.push(this.getPoolMap().get(id) as Experience);
			weights[i] =
				((count * this._sum[leaf]) / total) ** -this._beta / maxWeight;
		}
		this._advanceBeta();
		return { experiences, ids, weights };
	}

	public samplePool(batchSize: number): Experience[] {
		return this.sampleWithWeights(batchSize).experiences;
	}

	public clearPool(): void {
		super.clearPool();
		this._sum.fill(0);
		this._min.fill(Number.POSITIVE_INFINITY);
		this._maxPriority = 1.0;
	}

	private _setLeaf(id: number, value: number): void {
		let node = this._leafCount + (id % this._poolMaxSize);
		this._sum[node] = value;
		this._min[node] = value;
		for (node >>= 1; node >= 1; node >>= 1) {
			this._sum[node] = this._sum[2 * node] + this._sum[2 * node + 1];
			this._min[node] = Math.min(this._min[2 * node], this._min[2 * node + 1]);
		}
	}

	/** Leaf whose cumulative range holds the roll, in O(log N). */
	private _pickLeaf(roll: number): number {
		let node = 1;
		let rest = roll;
		while (node < this._leafCount) {
			const left = 2 * node;
			// An empty right subtree (rounding at the top of the range) goes left.
			if (rest < this._sum[left] || this._sum[left + 1] === 0) {
				node = left;
			} else {
				rest -= this._sum[left];
				node = left + 1;
			}
		}
		return node;
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
): PrioritizedExperiencePoolPort {
	return new PrioritizedExperiencePool(poolMaxSize, perConfig, rng);
}

export function createExperiencePool(
	enablePool: boolean,
	poolMaxSize: number,
	perConfig?: PerConfig & { prioritized: boolean },
	rng: () => number = Math.random
): ExperiencePoolPort {
	if (!enablePool) {
		return DISABLED_POOL;
	}
	if (perConfig?.prioritized) {
		return createPrioritizedExperiencePool(poolMaxSize, perConfig, rng);
	}
	return new ExperiencePool(poolMaxSize, rng);
}
