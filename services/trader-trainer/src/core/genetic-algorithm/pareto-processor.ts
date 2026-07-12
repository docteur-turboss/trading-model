import { Fitness } from "@trading-model/common/domain/primitives";
import type {
	GenomeFitnessMeta,
	LamarckGenome,
	PopMember,
} from "./genome-types";
import type { ObjectiveVector, PopulationMeta } from "./nsga2";
import { buildPopulationMeta } from "./nsga2";
import type { DeepReadonly } from "./shared-types";

export function buildParetoFronts(
	updatedPop: DeepReadonly<LamarckGenome>[],
	objectives: ObjectiveVector[],
	metas: GenomeFitnessMeta[],
	rng: () => number
): {
	popWithMeta: PopMember[];
	popMeta: PopulationMeta;
	avgFit: number;
	avgEff: number;
} {
	const popMeta = buildPopulationMeta(objectives, rng);

	const popWithMeta: PopMember[] = updatedPop.map((genome, idx) => ({
		genome: genome as PopMember["genome"],
		fitness: Fitness.of(metas[idx].efficiencyScore),
		fitnessMeta: metas[idx],
	}));

	const avgFit =
		popWithMeta.reduce((sum, member) => sum + member.fitness, 0) /
		popWithMeta.length;
	const avgEff =
		metas.reduce((sum, meta) => sum + meta.efficiencyScore, 0) / metas.length;

	return { popWithMeta, popMeta, avgFit, avgEff };
}

export function sortPopulation(
	popWithMeta: PopMember[],
	popMeta: PopulationMeta
): PopMember[] {
	const sortedIdx = Array.from(
		{ length: popWithMeta.length },
		(_unused, idx) => idx
	).sort((idxA, idxB) =>
		popMeta.paretoRank[idxA] === popMeta.paretoRank[idxB]
			? popMeta.crowdingDist[idxB] - popMeta.crowdingDist[idxA]
			: popMeta.paretoRank[idxA] - popMeta.paretoRank[idxB]
	);

	return sortedIdx.map((idx) => popWithMeta[idx]);
}
