import type { Genome } from "../genome-types";
import { genomicDistance } from "./distance";

export interface NoveltyScoreOptions {
	neighbors?: number;
	distanceFn?: (left: Genome, right: Genome) => number;
}

export function noveltyScore(
	genome: Genome,
	population: Genome[],
	archive: Genome[],
	options: NoveltyScoreOptions = {}
): number {
	const { neighbors = 15, distanceFn = genomicDistance } = options;
	const pool = [...population, ...archive].filter(
		(other) => other.id !== genome.id
	);

	if (pool.length === 0) {
		return 0;
	}

	const distances = pool
		.map((other) => distanceFn(genome, other))
		.sort((left, right) => left - right);

	const kActual = Math.min(neighbors, distances.length);
	const knnSum = distances
		.slice(0, kActual)
		.reduce((sum, value) => sum + value, 0);
	return kActual > 0 ? knnSum / kActual : 0;
}
