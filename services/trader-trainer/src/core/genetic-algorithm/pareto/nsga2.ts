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

function _buildPool(count: number, idx: number): number[] {
	return Array.from({ length: count - 1 }, (_unused, jdx) =>
		jdx >= idx ? jdx + 1 : jdx
	);
}

function _isDominated(
	objectives: ObjectiveVector[],
	candidateIdx: number,
	targetIdx: number
): boolean {
	return (
		objectives[candidateIdx].avgPnl >= objectives[targetIdx].avgPnl &&
		objectives[candidateIdx].sharpe >= objectives[targetIdx].sharpe &&
		objectives[candidateIdx].negFlops >= objectives[targetIdx].negFlops &&
		(objectives[candidateIdx].avgPnl > objectives[targetIdx].avgPnl ||
			objectives[candidateIdx].sharpe > objectives[targetIdx].sharpe ||
			objectives[candidateIdx].negFlops > objectives[targetIdx].negFlops)
	);
}

function _sampleDomination(
	objectives: ObjectiveVector[],
	dominated: Int32Array,
	idx: number,
	sampleSize: number,
	rng: () => number
): void {
	const pool = _buildPool(objectives.length, idx);
	for (let sample = 0; sample < sampleSize; sample++) {
		const pick = sample + Math.floor(rng() * (pool.length - sample));
		[pool[sample], pool[pick]] = [pool[pick], pool[sample]];
		if (_isDominated(objectives, pool[sample], idx)) {
			dominated[idx]++;
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

function _sortIndicesByObjective(
	indices: number[],
	key: keyof ObjectiveVector,
	objectives: ObjectiveVector[]
): number[] {
	return [...indices].sort(
		(left, right) => objectives[left][key] - objectives[right][key]
	);
}

function _computeCrowdingRange(
	sorted: number[],
	key: keyof ObjectiveVector,
	objectives: ObjectiveVector[]
): number {
	return (
		objectives[sorted[sorted.length - 1]][key] - objectives[sorted[0]][key]
	);
}

function _accumulateCrowdingDistances(
	sorted: number[],
	key: keyof ObjectiveVector,
	objectives: ObjectiveVector[],
	crowding: number[],
	range: number
): void {
	for (let mid = 1; mid < sorted.length - 1; mid++) {
		crowding[sorted[mid]] +=
			(objectives[sorted[mid + 1]][key] - objectives[sorted[mid - 1]][key]) /
			range;
	}
}

function _computeCrowdingForObjective(
	key: keyof ObjectiveVector,
	objectives: ObjectiveVector[],
	crowding: number[],
	indices: number[]
): void {
	const sorted = _sortIndicesByObjective(indices, key, objectives);
	crowding[sorted[0]] = Number.POSITIVE_INFINITY;
	crowding[sorted[sorted.length - 1]] = Number.POSITIVE_INFINITY;
	const range = _computeCrowdingRange(sorted, key, objectives);
	if (range === 0) {
		return;
	}
	_accumulateCrowdingDistances(sorted, key, objectives, crowding, range);
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

function _computeMaxRank(paretoRank: number[]): number {
	return Math.max(...paretoRank);
}

function _assignCrowdingForAllFronts(
	paretoRank: number[],
	objectives: ObjectiveVector[],
	crowdingDist: number[]
): void {
	for (let rankIdx = 0; rankIdx <= _computeMaxRank(paretoRank); rankIdx++) {
		assignCrowding(
			_collectFront(paretoRank, rankIdx),
			objectives,
			crowdingDist
		);
	}
}

export function buildPopulationMeta(
	objectives: ObjectiveVector[],
	rng: () => number
): PopulationMeta {
	const count = objectives.length;
	const paretoRank = _computeParetoRank(objectives, rng);
	const crowdingDist = new Array<number>(count).fill(0);
	_assignCrowdingForAllFronts(paretoRank, objectives, crowdingDist);
	return { objectives, paretoRank, crowdingDist };
}
