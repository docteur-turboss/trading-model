import type { Genome, GenomeFitnessMeta, LamarckGenome } from "./genome-types";
import type { ObjectiveVector, PopulationMeta } from "./nsga2";
import { buildPopulationMeta } from "./nsga2";
import { type DeepReadonly, withGenome } from "./shared-types";

export function buildParetoFronts(
	updatedPop: DeepReadonly<LamarckGenome>[],
	objectives: ObjectiveVector[],
	metas: GenomeFitnessMeta[],
	rng: () => number
): {
	popWithMeta: DeepReadonly<LamarckGenome>[];
	popMeta: PopulationMeta;
	avgFit: number;
	avgEff: number;
} {
	const popMeta = buildPopulationMeta(objectives, rng);

	const popWithMeta = updatedPop.map((genome, idx) =>
		withGenome(genome, {
			fitness: metas[idx].efficiencyScore,
			fitnessMeta: metas[idx],
		} as Partial<LamarckGenome>)
	);

	const avgFit =
		popWithMeta.reduce((sum, genome) => sum + (genome.fitness ?? 0), 0) /
		popWithMeta.length;
	const avgEff =
		metas.reduce((sum, meta) => sum + meta.efficiencyScore, 0) / metas.length;

	return { popWithMeta, popMeta, avgFit, avgEff };
}

export function sortPopulation(
	popWithMeta: DeepReadonly<LamarckGenome>[],
	popMeta: PopulationMeta
): Genome[] {
	const sortedIdx = Array.from(
		{ length: popWithMeta.length },
		(_unused, idx) => idx
	).sort((idxA, idxB) =>
		popMeta.paretoRank[idxA] === popMeta.paretoRank[idxB]
			? popMeta.crowdingDist[idxB] - popMeta.crowdingDist[idxA]
			: popMeta.paretoRank[idxA] - popMeta.paretoRank[idxB]
	);

	return sortedIdx.map((idx) => popWithMeta[idx] as Genome);
}
