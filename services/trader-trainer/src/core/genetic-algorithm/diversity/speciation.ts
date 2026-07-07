import type { Genome } from "../genome-types";
import { genomicDistance } from "./distance";

export interface Species {
	representativeIndex: number;
	memberIndices: number[];
}

export function speciate(population: Genome[], threshold = 0.3): Species[] {
	return _assignToSpecies(population, threshold);
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
