import type { ObjectiveVector } from "./domination";
import { buildDominationMatrix } from "./domination";

const EXACT_NSGA2_THRESHOLD = 300;

export interface PopulationMeta {
	objectives: ObjectiveVector[];
	paretoRank: number[];
	crowdingDist: number[];
}

function _findInitialFront(dominated: Int32Array, length: number): number[] {
	return Array.from({ length }, (_unused, index) => index).filter(
		(idx) => dominated[idx] === 0
	);
}

function _buildNextFront(
	current: number[],
	dominates: number[][],
	dominated: Int32Array
): number[] {
	const next: number[] = [];
	for (const i of current) {
		for (const j of dominates[i]) {
			if (--dominated[j] === 0) {
				next.push(j);
			}
		}
	}
	return next;
}

function computeParetoFronts(
	dominated: Int32Array,
	dominates: number[][],
	length: number
): number[][] {
	const fronts: number[][] = [];
	let current = _findInitialFront(dominated, length);

	while (current.length > 0) {
		fronts.push(current);
		current = _buildNextFront(current, dominates, dominated);
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

function nondominatedSortExact(objectives: ObjectiveVector[]): number[] {
	const { dominated, dominates } = buildDominationMatrix(objectives);
	const fronts = computeParetoFronts(dominated, dominates, objectives.length);
	return assignRanks(fronts, objectives.length);
}

function _buildPool(count: number, i: number): number[] {
	return Array.from({ length: count - 1 }, (_unused, jdx) =>
		jdx >= i ? jdx + 1 : jdx
	);
}

function _sampleDomination(
	objectives: ObjectiveVector[],
	dominated: Int32Array,
	i: number,
	sampleSize: number,
	rng: () => number
): void {
	const pool = _buildPool(objectives.length, i);
	for (let sample = 0; sample < sampleSize; sample++) {
		const idx = sample + Math.floor(rng() * (pool.length - sample));
		[pool[sample], pool[idx]] = [pool[idx], pool[sample]];
		if (objectives[pool[sample]].avgPnl >= objectives[i].avgPnl &&
			objectives[pool[sample]].sharpe >= objectives[i].sharpe &&
			objectives[pool[sample]].negFlops >= objectives[i].negFlops &&
			(objectives[pool[sample]].avgPnl > objectives[i].avgPnl ||
				objectives[pool[sample]].sharpe > objectives[i].sharpe ||
				objectives[pool[sample]].negFlops > objectives[i].negFlops)) {
			dominated[i]++;
		}
	}
}

function nondominatedSortApprox(
	objectives: ObjectiveVector[],
	rng: () => number
): number[] {
	const count = objectives.length;
	const sampleSize = Math.min(count - 1, Math.ceil(Math.sqrt(count) * 4));
	const dominated = new Int32Array(count);

	for (let i = 0; i < count; i++) {
		_sampleDomination(objectives, dominated, i, sampleSize, rng);
	}

	return Array.from(dominated);
}

function _computeParetoRank(
	objectives: ObjectiveVector[],
	rng: () => number
): number[] {
	return objectives.length > EXACT_NSGA2_THRESHOLD
		? nondominatedSortApprox(objectives, rng)
		: nondominatedSortExact(objectives);
}

function _setInfiniteCrowding(indices: number[], crowding: number[]): void {
	for (const idx of indices) {
		crowding[idx] = Number.POSITIVE_INFINITY;
	}
}

function _computeCrowdingForObjective(
	key: keyof ObjectiveVector,
	objectives: ObjectiveVector[],
	crowding: number[],
	indices: number[]
): void {
	const sorted = [...indices].sort(
		(left, right) => objectives[left][key] - objectives[right][key]
	);
	crowding[sorted[0]] = Number.POSITIVE_INFINITY;
	crowding[sorted[sorted.length - 1]] = Number.POSITIVE_INFINITY;
	const range =
		objectives[sorted[sorted.length - 1]][key] - objectives[sorted[0]][key];
	if (range === 0) {
		return;
	}
	for (let mid = 1; mid < sorted.length - 1; mid++) {
		crowding[sorted[mid]] +=
			(objectives[sorted[mid + 1]][key] - objectives[sorted[mid - 1]][key]) /
			range;
	}
}

function assignCrowding(
	indices: number[],
	objectives: ObjectiveVector[],
	crowding: number[]
): void {
	if (indices.length <= 2) {
		_setInfiniteCrowding(indices, crowding);
		return;
	}
	for (const idx of indices) {
		crowding[idx] = 0;
	}
	for (const key of [
		"avgPnl",
		"sharpe",
		"negFlops",
	] as (keyof ObjectiveVector)[]) {
		_computeCrowdingForObjective(key, objectives, crowding, indices);
	}
}

function _collectFront(paretoRank: number[], rankIdx: number): number[] {
	return paretoRank.reduce((acc, rank, index) => {
		if (rank === rankIdx) {
			acc.push(index);
		}
		return acc;
	}, [] as number[]);
}

export function buildPopulationMeta(
	objectives: ObjectiveVector[],
	rng: () => number
): PopulationMeta {
	const count = objectives.length;
	const paretoRank = _computeParetoRank(objectives, rng);
	const crowdingDist = new Array<number>(count).fill(0);

	for (let rankIdx = 0; rankIdx <= Math.max(...paretoRank); rankIdx++) {
		assignCrowding(
			_collectFront(paretoRank, rankIdx),
			objectives,
			crowdingDist
		);
	}

	return { objectives, paretoRank, crowdingDist };
}
