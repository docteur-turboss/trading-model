// ================================================================
//        speciation, diversity metrics, novelty scoring
// ================================================================

import type { Genome } from './genome-types';
import { encodeGenome } from './encoding';

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
export function genomicDistance(a: Genome, b: Genome): number {
  const va = encodeGenome(a);
  const vb = encodeGenome(b);

  if (va.length !== vb.length) {
    throw new Error(`genomicDistance: encoded length mismatch (${va.length} vs ${vb.length})`);
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
    const fits = sp.memberIndices.map(idx => population[idx].fitness ?? 0).filter(f => isFinite(f));
    if (fits.length > 0) {
      sp.averageFitness = fits.reduce((s, v) => s + v, 0) / fits.length;
    }
  }

  return species;
}

// ================================================================
//  3. Diversity metrics
// ================================================================

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
  const n = population.length;

  // ---- Mean pairwise distance (sampled for efficiency) ----
  let totalDist = 0;
  const pairs = Math.min(samplePairs, (n * (n - 1)) / 2);
  for (let k = 0; k < pairs; k++) {
    const i = Math.floor(Math.random() * n);
    let j = Math.floor(Math.random() * (n - 1));
    if (j >= i) j++;
    totalDist += genomicDistance(population[i], population[j]);
  }
  const meanPairwiseDistance = pairs > 0 ? totalDist / pairs : 0;

  // ---- Species metrics ----
  const sp = species ?? speciate(population);
  const speciesCount = sp.length;

  // Normalised Shannon entropy H = -∑ p log p / log(N)
  let entropy = 0;
  let maxSize = 0;
  for (const s of sp) {
    const p = s.memberIndices.length / n;
    if (p > 0) entropy -= p * Math.log(p);
    if (s.memberIndices.length > maxSize) maxSize = s.memberIndices.length;
  }
  const speciesEntropy = speciesCount > 1 ? entropy / Math.log(speciesCount) : 0;
  const dominanceFraction = maxSize / n;

  return { meanPairwiseDistance, speciesEntropy, speciesCount, dominanceFraction };
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
export function noveltyScore(
  g: Genome,
  population: Genome[],
  archive: Genome[],
  k = 15,
  distanceFn: (a: Genome, b: Genome) => number = genomicDistance
): number {
  const pool = [...population, ...archive].filter(other => other.id !== g.id);

  if (pool.length === 0) return 0;

  const distances = pool.map(other => distanceFn(g, other)).sort((a, b) => a - b);

  const kActual = Math.min(k, distances.length);
  const knnSum = distances.slice(0, kActual).reduce((s, v) => s + v, 0);
  return kActual > 0 ? knnSum / kActual : 0;
}

// ================================================================
//  5. Archive management
// ================================================================

/**
 * Optionally add a genome to the novelty archive.
 *
 * A genome is added when its novelty score exceeds `threshold`.
 * The archive is bounded to `maxSize`; least novel members are evicted.
 *
 * @returns Updated archive (may be the same array mutated in-place).
 */
export function updateNoveltyArchive(
  g: Genome,
  archive: Genome[],
  score: number,
  threshold = 0.1,
  maxSize = 500,
  population: Genome[] = []
): Genome[] {
  if (score < threshold) return archive;

  archive.push(g);

  if (archive.length > maxSize) {
    // Evict the least novel member
    const scores = archive.map((a, i) =>
      i === archive.length - 1
        ? score // newly added
        : noveltyScore(a, population, archive)
    );
    const minIdx = scores.indexOf(Math.min(...scores));
    archive.splice(minIdx, 1);
  }

  return archive;
}
