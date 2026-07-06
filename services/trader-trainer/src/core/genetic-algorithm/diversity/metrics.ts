import { genomicDistance } from "./distance";
import { type Species, speciate } from "./speciation";
import type { Genome } from "../genome-types";

export interface DiversityMetrics {
	meanPairwiseDistance: number;
	speciesEntropy: number;
	speciesCount: number;
	dominanceFraction: number;
}

export function diversityMetrics(
	population: Genome[],
	species?: Species[],
	samplePairs = 200
): DiversityMetrics {
	const count = population.length;
	const meanPairwiseDistance = _sampleMeanPairwiseDistance(population, samplePairs, count);

	const sp = species ?? speciate(population);
	const { speciesCount, speciesEntropy, dominanceFraction } = _computeSpeciesMetrics(sp, count);

	return {
		meanPairwiseDistance,
		speciesEntropy,
		speciesCount,
		dominanceFraction,
	};
}

function _sampleMeanPairwiseDistance(
	population: Genome[],
	samplePairs: number,
	count: number
): number {
	let totalDist = 0;
	const pairs = Math.min(samplePairs, (count * (count - 1)) / 2);
	for (let pair = 0; pair < pairs; pair++) {
		const i = Math.floor(Math.random() * count);
		let j = Math.floor(Math.random() * (count - 1));
		if (j >= i) {
			j++;
		}
		totalDist += genomicDistance(population[i], population[j]);
	}
	return pairs > 0 ? totalDist / pairs : 0;
}

function _computeEntropyAndDominance(
	species: Species[],
	count: number
): { entropy: number; maxSize: number } {
	let entropy = 0;
	let maxSize = 0;
	for (const speciesEntry of species) {
		const proportion = speciesEntry.memberIndices.length / count;
		if (proportion > 0) {
			entropy -= proportion * Math.log(proportion);
		}
		if (speciesEntry.memberIndices.length > maxSize) {
			maxSize = speciesEntry.memberIndices.length;
		}
	}
	return { entropy, maxSize };
}

function _computeSpeciesMetrics(
	species: Species[],
	count: number
): { speciesCount: number; speciesEntropy: number; dominanceFraction: number } {
	const speciesCount = species.length;
	const { entropy, maxSize } = _computeEntropyAndDominance(species, count);
	return {
		speciesCount,
		speciesEntropy: speciesCount > 1 ? entropy / Math.log(speciesCount) : 0,
		dominanceFraction: maxSize / count,
	};
}
