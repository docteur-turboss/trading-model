/**
 * ParetoEngine: NSGA-II ranking, crowding distance, and persistent archive.
 */

import type { LamarckGenome } from "./genome-types";

type DeepReadonly<TValue> = TValue extends (infer UValue)[]
	? readonly DeepReadonly<UValue>[]
	: TValue extends object
		? { readonly [KValue in keyof TValue]: DeepReadonly<TValue[KValue]> }
		: TValue;

export interface ObjectiveVector {
	/** Average PnL across windows. */
	avgPnl: number;
	/** Sharpe-like ratio. */
	sharpe: number;
	/** −estimated_inference_flops. */
	negFlops: number;
}

export interface PopulationMeta {
	objectives: ObjectiveVector[]; // [i] for genome at index i
	paretoRank: number[];
	crowdingDist: number[];
}

const EXACT_NSGA2_THRESHOLD = 300;

/**
 * Dominance check: a strictly dominates b if a ≥ b in all objectives
 * and strictly > in at least one.
 */
export function dominates(
	first: ObjectiveVector,
	second: ObjectiveVector
): boolean {
	return (
		first.avgPnl >= second.avgPnl &&
		first.sharpe >= second.sharpe &&
		first.negFlops >= second.negFlops &&
		(first.avgPnl > second.avgPnl ||
			first.sharpe > second.sharpe ||
			first.negFlops > second.negFlops)
	);
}

function _comparePair(
	i: number,
	j: number,
	objectives: ObjectiveVector[],
	dominated: Int32Array,
	dominates: number[][]
): void {
	if (dominates(objectives[i], objectives[j])) {
		dominates[i].push(j);
	} else if (dominates(objectives[j], objectives[i])) {
		dominated[i]++;
	}
}

function buildDominationMatrix(
	objectives: ObjectiveVector[]
): { dominated: Int32Array; dominates: number[][] } {
	const length = objectives.length;
	const dominated = new Int32Array(length);
	const dominates = Array.from({ length }, () => [] as number[]);

	for (let i = 0; i < length; i++) {
		for (let j = 0; j < length; j++) {
			if (i !== j) {
				_comparePair(i, j, objectives, dominated, dominates);
			}
		}
	}

	return { dominated, dominates };
}

function computeParetoFronts(
	dominated: Int32Array,
	dominates: number[][],
	length: number
): number[][] {
	const fronts: number[][] = [];
	let current = Array.from({ length }, (_unused, index) => index).filter(
		(idx) => dominated[idx] === 0
	);

	while (current.length > 0) {
		fronts.push(current);
		const next: number[] = [];
		for (const i of current) {
			for (const j of dominates[i]) {
				if (--dominated[j] === 0) {
					next.push(j);
				}
			}
		}
		current = next;
	}

	return fronts;
}

function assignRanks(fronts: number[][], length: number): number[] {
	const ranks = new Array<number>(length).fill(0);
	for (let rank = 0; rank < fronts.length; rank++) {
		for (const idx of fronts[rank]) {
			ranks[idx] = rank;
		}
	}
	return ranks;
}

/**
 * Exact O(n²) non-dominated sorting (for small populations).
 */
function nondominatedSortExact(objectives: ObjectiveVector[]): number[] {
	const { dominated, dominates } = buildDominationMatrix(objectives);
	const fronts = computeParetoFronts(dominated, dominates, objectives.length);
	return assignRanks(fronts, objectives.length);
}

/**
 * Approximate O(n·k) non-dominated sorting (for large populations).
 * Samples k random comparisons per individual.
 */
function nondominatedSortApprox(
	objectives: ObjectiveVector[],
	rng: () => number
): number[] {
	const count = objectives.length;
	const sampleSize = Math.min(count - 1, Math.ceil(Math.sqrt(count) * 4));
	const dominated = new Int32Array(count);

	for (let i = 0; i < count; i++) {
		const pool = Array.from({ length: count - 1 }, (_unused, jdx) =>
			jdx >= i ? jdx + 1 : jdx
		);
		for (let sample = 0; sample < sampleSize; sample++) {
			const idx = sample + Math.floor(rng() * (pool.length - sample));
			[pool[sample], pool[idx]] = [pool[idx], pool[sample]];
			if (dominates(objectives[pool[sample]], objectives[i])) {
				dominated[i]++;
			}
		}
	}

	return Array.from(dominated);
}

/**
 * Assign crowding distance for individuals on a front.
 * Boundary points get Infinity; interior points get a distance metric.
 */
function assignCrowding(
	indices: number[],
	objectives: ObjectiveVector[],
	crowding: number[]
): void {
	if (indices.length <= 2) {
		for (const idx of indices) {
			crowding[idx] = Number.POSITIVE_INFINITY;
		}
		return;
	}

	const keys: (keyof ObjectiveVector)[] = ["avgPnl", "sharpe", "negFlops"];
	for (const idx of indices) {
		crowding[idx] = 0;
	}

	for (const key of keys) {
		const sorted = [...indices].sort(
			(left, right) => objectives[left][key] - objectives[right][key]
		);
		crowding[sorted[0]] = Number.POSITIVE_INFINITY;
		crowding[sorted[sorted.length - 1]] = Number.POSITIVE_INFINITY;
		const range =
			objectives[sorted[sorted.length - 1]][key] - objectives[sorted[0]][key];
		if (range === 0) {
			continue;
		}
		for (let mid = 1; mid < sorted.length - 1; mid++) {
			crowding[sorted[mid]] +=
				(objectives[sorted[mid + 1]][key] - objectives[sorted[mid - 1]][key]) /
				range;
		}
	}
}

/**
 * Build population metadata: Pareto ranks and crowding distances.
 */
export function buildPopulationMeta(
	objectives: ObjectiveVector[],
	rng: () => number
): PopulationMeta {
	const count = objectives.length;
	const paretoRank =
		count > EXACT_NSGA2_THRESHOLD
			? nondominatedSortApprox(objectives, rng)
			: nondominatedSortExact(objectives);

	const crowdingDist = new Array<number>(count).fill(0);
	const maxRank = Math.max(...paretoRank);

	for (let rankIdx = 0; rankIdx <= maxRank; rankIdx++) {
		const front = paretoRank.reduce((acc, rank, index) => {
			if (rank === rankIdx) {
				acc.push(index);
			}
			return acc;
		}, [] as number[]);
		assignCrowding(front, objectives, crowdingDist);
	}

	return { objectives, paretoRank, crowdingDist };
}

/**
 * Elitist Pareto archive: persists across generations.
 * Only non-dominated solutions are kept.
 */
export class ParetoArchive {
	private _members: DeepReadonly<LamarckGenome>[] = [];
	private _objs: ObjectiveVector[] = [];

	/**
	 * Offer new candidates to the archive.
	 * A candidate is accepted if it is not dominated by any current archive member.
	 * Any archive members dominated by the new candidate are evicted.
	 * Returns true if the archive changed.
	 */
	update(
		genomes: DeepReadonly<LamarckGenome>[],
		objectives: ObjectiveVector[]
	): boolean {
		let changed = false;

		for (let ci = 0; ci < genomes.length; ci++) {
			const cObj = objectives[ci];
			if (this._objs.some((aObj) => dominates(aObj, cObj))) {
				continue; // dominated, skip
			}

			// Evict dominated archive members
			const keep = this._members.map(
				(_, ai) => !dominates(cObj, this._objs[ai])
			);
			this._members = [
				...this._members.filter((_unused, index) => keep[index]),
				genomes[ci],
			];
			this._objs = [
				...this._objs.filter((_unused, index) => keep[index]),
				cObj,
			];
			changed = true;
		}

		return changed;
	}

	get members(): DeepReadonly<LamarckGenome>[] {
		return this._members;
	}
	get size(): number {
		return this._members.length;
	}
}
