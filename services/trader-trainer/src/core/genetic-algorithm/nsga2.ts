/** All objectives we optimise simultaneously. */
export type ObjectiveVector = {
  avgPnl: number;
  sharpe: number;
  negFlops: number;
};

/** Index-parallel arrays — avoids genome-copy explosion. */
export type PopulationMeta = {
  objectives: ObjectiveVector[];
  paretoRank: number[];
  crowdingDist: number[];
};

function dominates(a: ObjectiveVector, b: ObjectiveVector): boolean {
  return (
    a.avgPnl >= b.avgPnl &&
    a.sharpe >= b.sharpe &&
    a.negFlops >= b.negFlops &&
    (a.avgPnl > b.avgPnl || a.sharpe > b.sharpe || a.negFlops > b.negFlops)
  );
}

function nondominatedSortExact(objectives: ObjectiveVector[]): number[] {
  const n = objectives.length;
  const dominated = new Int32Array(n);
  const dominates_ = Array.from({ length: n }, () => [] as number[]);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (dominates(objectives[i], objectives[j])) dominates_[i].push(j);
      else if (dominates(objectives[j], objectives[i])) dominated[i]++;
    }
  }

  const ranks = new Array<number>(n).fill(0);
  let front = Array.from({ length: n }, (_, i) => i).filter(i => dominated[i] === 0);
  let rank = 0;

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

/* istanbul ignore next */
function nondominatedSortApprox(objectives: ObjectiveVector[], rng: () => number): number[] {
  const n = objectives.length;
  const k = Math.min(n - 1, Math.ceil(Math.sqrt(n) * 4));
  const dominated = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const pool = Array.from({ length: n - 1 }, (_, j) => (j >= i ? j + 1 : j));
    for (let s = 0; s < k; s++) {
      const idx = s + Math.floor(rng() * (pool.length - s));
      [pool[s], pool[idx]] = [pool[idx], pool[s]];
      if (dominates(objectives[pool[s]], objectives[i])) dominated[i]++;
    }
  }

  return Array.from(dominated);
}

/* istanbul ignore next */
function assignCrowding(
  indices: number[],
  objectives: ObjectiveVector[],
  crowding: number[]
): void {
  if (indices.length <= 2) {
    for (const i of indices) crowding[i] = Infinity;
    return;
  }

  const keys: (keyof ObjectiveVector)[] = ['avgPnl', 'sharpe', 'negFlops'];
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

const EXACT_NSGA2_THRESHOLD = 300;

export function buildPopulationMeta(objectives: ObjectiveVector[], rng: () => number): PopulationMeta {
  const n = objectives.length;
  /* istanbul ignore next */
  const paretoRank =
    n > EXACT_NSGA2_THRESHOLD
      ? nondominatedSortApprox(objectives, rng)
      : nondominatedSortExact(objectives);

  const crowdingDist = new Array<number>(n).fill(0);
  const maxRank = Math.max(...paretoRank);

  for (let r = 0; r <= maxRank; r++) {
    const front = paretoRank.reduce(
      (acc, rank, i) => (rank === r ? [...acc, i] : acc),
      [] as number[]
    );
    assignCrowding(front, objectives, crowdingDist);
  }

  return { objectives, paretoRank, crowdingDist };
}
