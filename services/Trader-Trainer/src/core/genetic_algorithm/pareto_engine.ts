/**
 * ParetoEngine: NSGA-II ranking, crowding distance, and persistent archive.
 */

import type { LamarckGenome } from "./genome_types";

type DeepReadonly<T> =
  T extends (infer U)[] ? ReadonlyArray<DeepReadonly<U>> :
  T extends object      ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T;

export type ObjectiveVector = {
  /** Average PnL across windows. */
  avgPnl:   number;
  /** Sharpe-like ratio. */
  sharpe:   number;
  /** −estimated_inference_flops. */
  negFlops: number;
};

export type PopulationMeta = {
  objectives:   ObjectiveVector[];   // [i] for genome at index i
  paretoRank:   number[];
  crowdingDist: number[];
};

const EXACT_NSGA2_THRESHOLD = 300;

/**
 * Dominance check: a strictly dominates b if a ≥ b in all objectives
 * and strictly > in at least one.
 */
export function dominates(a: ObjectiveVector, b: ObjectiveVector): boolean {
  return (
    a.avgPnl >= b.avgPnl && a.sharpe >= b.sharpe && a.negFlops >= b.negFlops &&
    (a.avgPnl > b.avgPnl || a.sharpe > b.sharpe || a.negFlops > b.negFlops)
  );
}

/**
 * Exact O(n²) non-dominated sorting (for small populations).
 */
function nondominatedSortExact(objectives: ObjectiveVector[]): number[] {
  const n        = objectives.length;
  const dominated  = new Int32Array(n);
  const dominates_ = Array.from({ length: n }, () => [] as number[]);
 
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (dominates(objectives[i], objectives[j])) dominates_[i].push(j);
      else if (dominates(objectives[j], objectives[i])) dominated[i]++;
    }
  }
 
  const ranks = new Array<number>(n).fill(0);
  let front   = Array.from({ length: n }, (_, i) => i).filter(i => dominated[i] === 0);
  let rank    = 0;
 
  while (front.length > 0) {
    const next: number[] = [];
    for (const i of front) {
      ranks[i] = rank;
      for (const j of dominates_[i]) {
        if (--dominated[j] === 0) next.push(j);
      }
    }
    front = next;
    rank++;
  }
 
  return ranks;
}

/**
 * Approximate O(n·k) non-dominated sorting (for large populations).
 * Samples k random comparisons per individual.
 */
function nondominatedSortApprox(objectives: ObjectiveVector[], rng: () => number): number[] {
  const n          = objectives.length;
  const k          = Math.min(n - 1, Math.ceil(Math.sqrt(n) * 4));
  const dominated  = new Int32Array(n);
 
  for (let i = 0; i < n; i++) {
    const pool = Array.from({ length: n - 1 }, (_, j) => j >= i ? j + 1 : j);
    for (let s = 0; s < k; s++) {
      const idx  = s + Math.floor(rng() * (pool.length - s));
      [pool[s], pool[idx]] = [pool[idx], pool[s]];
      if (dominates(objectives[pool[s]], objectives[i])) dominated[i]++;
    }
  }
 
  return Array.from(dominated);
}

/**
 * Assign crowding distance for individuals on a front.
 * Boundary points get Infinity; interior points get a distance metric.
 */
function assignCrowding(
  indices: number[],
  objectives: ObjectiveVector[],
  crowding: number[],
): void {
  if (indices.length <= 2) {
    for (const i of indices) crowding[i] = Infinity;
    return;
  }
 
  const keys: (keyof ObjectiveVector)[] = ["avgPnl", "sharpe", "negFlops"];
  for (const i of indices) crowding[i] = 0;
 
  for (const k of keys) {
    const sorted = [...indices].sort((a, b) => objectives[a][k] - objectives[b][k]);
    crowding[sorted[0]] = crowding[sorted[sorted.length - 1]] = Infinity;
    const range = objectives[sorted[sorted.length - 1]][k] - objectives[sorted[0]][k];
    if (range === 0) continue;
    for (let m = 1; m < sorted.length - 1; m++) {
      crowding[sorted[m]] += (objectives[sorted[m + 1]][k] - objectives[sorted[m - 1]][k]) / range;
    }
  }
}

/**
 * Build population metadata: Pareto ranks and crowding distances.
 */
export function buildPopulationMeta(
  objectives: ObjectiveVector[],
  rng: () => number,
): PopulationMeta {
  const n          = objectives.length;
  const paretoRank = n > EXACT_NSGA2_THRESHOLD
    ? nondominatedSortApprox(objectives, rng)
    : nondominatedSortExact(objectives);
 
  const crowdingDist = new Array<number>(n).fill(0);
  const maxRank      = Math.max(...paretoRank);
 
  for (let r = 0; r <= maxRank; r++) {
    const front = paretoRank.reduce((acc, rank, i) => (rank === r ? [...acc, i] : acc), [] as number[]);
    assignCrowding(front, objectives, crowdingDist);
  }
 
  return { objectives, paretoRank, crowdingDist };
}

/**
 * Elitist Pareto archive: persists across generations.
 * Only non-dominated solutions are kept.
 */
export class ParetoArchive {
  private _members: DeepReadonly<LamarckGenome>[] = [];
  private _objs:    ObjectiveVector[]             = [];
 
  /**
   * Offer new candidates to the archive.
   * A candidate is accepted if it is not dominated by any current archive member.
   * Any archive members dominated by the new candidate are evicted.
   * Returns true if the archive changed.
   */
  update(genomes: DeepReadonly<LamarckGenome>[], objectives: ObjectiveVector[]): boolean {
    let changed = false;
 
    for (let ci = 0; ci < genomes.length; ci++) {
      const cObj = objectives[ci];
      if (this._objs.some(aObj => dominates(aObj, cObj))) continue; // dominated, skip
 
      // Evict dominated archive members
      const keep     = this._members.map((_, ai) => !dominates(cObj, this._objs[ai]));
      this._members  = [...this._members.filter((_, i) => keep[i]), genomes[ci]];
      this._objs     = [...this._objs.filter((_, i) => keep[i]), cObj];
      changed        = true;
    }
 
    return changed;
  }
 
  get members(): DeepReadonly<LamarckGenome>[] { return this._members; }
  get size():    number                         { return this._members.length; }
}
