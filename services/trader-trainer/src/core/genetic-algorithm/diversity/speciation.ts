import { genomicDistance } from "./distance";
import type { Genome } from "../genome-types";

export interface Species {
	representativeIndex: number;
	memberIndices: number[];
	averageFitness?: number;
}

export function speciate(population: Genome[], threshold = 0.3): Species[] {
	const species = _assignToSpecies(population, threshold);
	_computeAverageFitnessPerSpecies(population, species);
	return species;
}

function _assignToSpecies(population: Genome[], threshold: number): Species[] {
	const species: Species[] = [];
	for (let i = 0; i < population.length; i++) {
		let assigned = false;
		for (const sp of species) {
			const rep = population[sp.representativeIndex];
			if (genomicDistance(population[i], rep) < threshold) {
				sp.memberIndices.push(i);
				assigned = true;
				break;
			}
		}
		if (!assigned) {
			species.push({ representativeIndex: i, memberIndices: [i] });
		}
	}
	return species;
}

function _computeAverageFitnessPerSpecies(
	population: Genome[],
	species: Species[]
): void {
	for (const sp of species) {
		const fits = sp.memberIndices
			.map((idx) => population[idx].fitness ?? 0)
			.filter((fit) => Number.isFinite(fit));
		if (fits.length > 0) {
			sp.averageFitness = fits.reduce((sum, value) => sum + value, 0) / fits.length;
		}
	}
}
