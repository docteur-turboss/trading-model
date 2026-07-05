// ================================================================
//        speciation, diversity metrics, novelty scoring
// ================================================================

import { encodeGenome } from "./encoding";
import type { Genome } from "./genome-types";

// ================================================================
//  1. Genomic distance
// ================================================================

/**
 * Compute a distance between two genomes in hyperparameter space.
 *
 * The distance is a weighted combination of:
 *   - L2 distance over continuous scalars (encoded as Float32Array)
 *   - Hamming distance over structural / categorical dimensions
 *
 * Both components are normalised by the vector length so the result
 * is roughly in [0, 1] for "typical" genomes.
 */
export function genomicDistance(left: Genome, right: Genome): number {
	const va = encodeGenome(left);
	const vb = encodeGenome(right);

	if (va.length !== vb.length) {
		throw new Error(
			`genomicDistance: encoded length mismatch (${va.length} vs ${vb.length})`
		);
	}

	let l2sq = 0;
	for (let i = 0; i < va.length; i++) {
		const diff = va[i] - vb[i];
		l2sq += diff * diff;
	}

	return Math.sqrt(l2sq) / Math.sqrt(va.length);
}

// ================================================================
//  2. Speciation
// ================================================================

/** A species cluster: a representative genome and the indices of all its members. */
export interface Species {
	/** Index into original population array of the representative genome */
	representativeIndex: number;
	/** Indices of all members (including representative) */
	memberIndices: number[];
	/** Computed average fitness of members (set after evaluation) */
	averageFitness?: number;
}

/**
 * Partition `population` into species using the NEAT-inspired δ threshold.
 *
 * Algorithm:
 *   For each individual, compare to existing species representatives.
 *   If distance < threshold → assign to that species.
 *   Otherwise → create a new species with this individual as representative.
 *
 * @param population   Full generation.
 * @param threshold    Compatibility distance threshold δ.
 */
export function speciate(population: Genome[], threshold = 0.3): Species[] {
	const species: Species[] = [];

	for (let i = 0; i < population.length; i++) {
		let assigned = false;

		for (const sp of species) {
			const rep = population[sp.representativeIndex];
			const dist = genomicDistance(population[i], rep);
			if (dist < threshold) {
				sp.memberIndices.push(i);
				assigned = true;
				break;
			}
		}

		if (!assigned) {
			species.push({ representativeIndex: i, memberIndices: [i] });
		}
	}

	// Annotate average fitness per species
	for (const sp of species) {
		const fits = sp.memberIndices
			.map((idx) => population[idx].fitness ?? 0)
			.filter((fit) => Number.isFinite(fit));
		if (fits.length > 0) {
			sp.averageFitness =
				fits.reduce((sum, value) => sum + value, 0) / fits.length;
		}
	}

	return species;
}

// ================================================================
//  3. Diversity metrics
// ================================================================

/** Population-level diversity metrics: pairwise distance, species entropy, and dominance. */
export interface DiversityMetrics {
	/** Mean pairwise genomic distance over a sample of pairs */
	meanPairwiseDistance: number;
	/** Normalised Shannon entropy of species distribution */
	speciesEntropy: number;
	/** Number of distinct species */
	speciesCount: number;
	/** Largest species size as fraction of population */
	dominanceFraction: number;
}

/**
 * Compute population-level diversity metrics.
 *
 * @param population  Full generation.
 * @param species     Pre-computed speciation (optional — computed if omitted).
 * @param samplePairs Number of random pairs to sample for mean pairwise distance.
 */
export function diversityMetrics(
	population: Genome[],
	species?: Species[],
	samplePairs = 200
): DiversityMetrics {
	const count = population.length;

	// ---- Mean pairwise distance (sampled for efficiency) ----
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
	const meanPairwiseDistance = pairs > 0 ? totalDist / pairs : 0;

	// ---- Species metrics ----
	const sp = species ?? speciate(population);
	const speciesCount = sp.length;

	// Normalised Shannon entropy H = -∑ p log p / log(N)
	let entropy = 0;
	let maxSize = 0;
	for (const speciesEntry of sp) {
		const proportion = speciesEntry.memberIndices.length / count;
		if (proportion > 0) {
			entropy -= proportion * Math.log(proportion);
		}
		if (speciesEntry.memberIndices.length > maxSize) {
			maxSize = speciesEntry.memberIndices.length;
		}
	}
	const speciesEntropy =
		speciesCount > 1 ? entropy / Math.log(speciesCount) : 0;
	const dominanceFraction = maxSize / count;

	return {
		meanPairwiseDistance,
		speciesEntropy,
		speciesCount,
		dominanceFraction,
	};
}

// ================================================================
//  4. Novelty score
// ================================================================

/**
 * Compute novelty as the mean distance to the k nearest neighbours
 * in the combined current population + historical archive.
 *
 * This is the standard "novelty search" metric (Lehman & Stanley 2011)
 * applied in genome space rather than behaviour space. For behaviour-space
 * novelty, pass behaviour-descriptor encodings via a custom distance fn.
 *
 * @param g          Candidate genome.
 * @param population Current population (may include g itself).
 * @param archive    Historical archive of notable genomes.
 * @param k          Number of nearest neighbours (default 15).
 * @param distanceFn Custom distance function (defaults to genomicDistance).
 */
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

// ================================================================
//  5. Archive management
// ================================================================

/** Configuration for updating the novelty archive. */
export interface NoveltyArchiveConfig {
	/** Minimum novelty score required for archive admission. */
	threshold?: number;
	/** Maximum archive size; least novel members are evicted when exceeded. */
	maxSize?: number;
	/** Current population (used for re-evaluating novelty when evicting). */
	population?: Genome[];
}

export interface NoveltyArchiveUpdateContext {
	genome: Genome;
	archive: Genome[];
	score: number;
	config?: NoveltyArchiveConfig;
}

/**
 * Optionally add a genome to the novelty archive.
 *
 * A genome is added when its novelty score exceeds `config.threshold`.
 * The archive is bounded to `config.maxSize`; least novel members are evicted.
 *
 * @returns Updated archive (may be the same array mutated in-place).
 */
export function updateNoveltyArchive(
	ctx: NoveltyArchiveUpdateContext
): Genome[] {
	const { genome, archive, score, config: configArg } = ctx;
	const config = configArg ?? {};
	const { threshold = 0.1, maxSize = 500, population = [] } = config;
	if (score < threshold) {
		return archive;
	}

	archive.push(genome);

	if (archive.length > maxSize) {
		// Evict the least novel member
		const scores = archive.map((member, index) =>
			index === archive.length - 1
				? score // newly added
				: noveltyScore(member, population, archive)
		);
		const minIdx = scores.indexOf(Math.min(...scores));
		archive.splice(minIdx, 1);
	}

	return archive;
}
