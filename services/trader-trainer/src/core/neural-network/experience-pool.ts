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

class ExperiencePool implements IExperiencePool {
	private _poolMap = new Map<number, Experience>();
	private _poolInputToId = new WeakMap<Float32Array, number>();
	protected _nextPoolId = 0;
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

/**
 * Prioritized Experience Replay pool.
 *
 * Uses proportional prioritization: probability of sampling experience i is
 * proportional to priority_i^alpha. Priorities are based on recency — newer
 * experiences are more likely to be sampled, reflecting that recent transitions
 * carry more relevant signal for on-policy-like updates.
 *
 * After sampling, importance sampling (IS) weights are computed as:
 *   w_i = (N * P(i))^(-beta)
 * where P(i) = priority_i^alpha / sum(priority_j^alpha) and N is pool size.
 * The weights are normalized by max(w) to reduce variance.
 *
 * When betaAnneal is true, beta is annealed from its initial value towards 1.0
 * over the lifetime of the pool (progressive correction).
 */
class PrioritizedExperiencePool extends ExperiencePool {
	private _priorities = new Map<number, number>();
	private _maxPriority = 1.0;
	private readonly _alpha: number;
	private _beta: number;
	private readonly _betaAnneal: boolean;
	private _stepCount = 0;

	constructor(
		poolMaxSize: number,
		alpha: number,
		beta: number,
		betaAnneal: boolean
	) {
		super(poolMaxSize);
		this._alpha = alpha;
		this._beta = beta;
		this._betaAnneal = betaAnneal;
	}

	public add(experience: Experience): void {
		super.add(experience);
		const id = this._nextPoolId - 1;
		this._priorities.set(id, this._maxPriority);
	}

	private _computeSamplingWeights(): {
		indices: number[];
		weights: Float32Array;
	} {
		const poolMap = this.getPoolMap();
		const entries = [...poolMap.entries()];
		if (entries.length === 0) {
			return { indices: [], weights: new Float32Array(0) };
		}

		const priorities = entries.map(([id]) => {
			return this._priorities.get(id) ?? 1.0;
		});

		const powered = priorities.map((priority) => priority ** this._alpha);
		const sumPowered = powered.reduce((acc, val) => acc + val, 0);
		const probs = powered.map((power) => power / sumPowered);

		const entryCount = entries.length;
		const isWeights = probs.map((prob) => (entryCount * prob) ** -this._beta);
		const maxWeight = Math.max(...isWeights);
		const normalizedWeights = new Float32Array(
			isWeights.map((weight) => weight / maxWeight)
		);

		return {
			indices: entries.map(([id]) => id),
			weights: normalizedWeights,
		};
	}

	public samplePool(batchSize: number): Experience[] {
		const poolMap = this.getPoolMap();
		const size = poolMap.size;
		if (size === 0) {
			return [];
		}
		if (batchSize >= size) {
			return [...poolMap.values()];
		}

		this._stepCount++;
		if (this._betaAnneal) {
			const annealRate = 0.0001;
			this._beta = Math.min(1.0, this._beta + annealRate * this._stepCount);
		}

		const { indices, weights } = this._computeSamplingWeights();
		if (indices.length === 0) {
			return [];
		}

		const sampled: Experience[] = [];
		const used = new Set<number>();

		for (let batchIdx = 0; batchIdx < batchSize; batchIdx++) {
			const roll = Math.random();
			let cumulative = 0;
			const probs = indices.map(
				(_entryId, entryIdx) => weights[entryIdx] / (weights.length || 1)
			);
			const probSum = probs.reduce((acc, val) => acc + val, 0);
			const normalized = probs.map((prob) => prob / probSum);

			for (let j = 0; j < normalized.length; j++) {
				cumulative += normalized[j];
				if (roll <= cumulative && !used.has(indices[j])) {
					used.add(indices[j]);
					const exp = poolMap.get(indices[j]);
					if (exp) {
						sampled.push(exp);
						this._maxPriority = Math.max(
							this._maxPriority,
							this._priorities.get(indices[j]) ?? 1.0
						);
					}
					break;
				}
			}
		}

		return sampled;
	}

	public clearPool(): void {
		super.clearPool();
		this._priorities.clear();
		this._maxPriority = 1.0;
	}

	public remove(input: Float32Array): void {
		super.remove(input);
	}
}

export function createExperiencePool(
	enablePool: boolean,
	poolMaxSize: number,
	perConfig?: {
		prioritized: boolean;
		alpha: number;
		beta: number;
		betaAnneal: boolean;
	}
): IExperiencePool {
	if (!enablePool) {
		return DISABLED_POOL;
	}
	if (perConfig?.prioritized) {
		return new PrioritizedExperiencePool(
			poolMaxSize,
			perConfig.alpha,
			perConfig.beta,
			perConfig.betaAnneal
		);
	}
	return new ExperiencePool(poolMaxSize);
}
