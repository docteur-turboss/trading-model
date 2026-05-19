/**
 * AdaptiveControlSystem: Self-adaptive GA control parameters.
 * Adjusts population size, elitism, survival rate, and episodes based on
 * stagnation and improvement history.
 */

import type { GAControlGenome } from './genome-types';

type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

function deepFreeze<T>(obj: T): DeepReadonly<T> {
  if (obj === null || typeof obj !== 'object') return obj as DeepReadonly<T>;

  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }

  return Object.freeze(obj) as DeepReadonly<T>;
}

/**
 * Adapt GA control parameters based on efficiency history and stagnation.
 * Increases exploration (pop size) when stagnating, decreases when improving.
 * Increases exploitation (elitism, episodes) when stagnating.
 */
export function adaptGAControl(
  ctrl: DeepReadonly<GAControlGenome>,
  effHistory: number[],
  stagnation: number
): Readonly<GAControlGenome> {
  if (effHistory.length < 3) return ctrl;

  const recent = effHistory.slice(-5);
  const isImproving = recent[recent.length - 1] > recent[0];

  let popSize = ctrl.populationSize;
  let elitism = ctrl.elitismFraction;
  let survivors = ctrl.survivorFraction;
  let eps = ctrl.episodesPerIndividual;

  // Exploration pressure: increase pop when stagnating, decrease when improving
  if (stagnation > 5 && popSize < 80) popSize = Math.min(80, popSize + 2);
  if (isImproving && popSize > 8) popSize = Math.max(8, popSize - 1);

  // Exploitation pressure: increase elitism when stagnating
  if (stagnation > 8) elitism = Math.min(0.3, elitism + 0.02);
  if (isImproving) elitism = Math.max(0.05, elitism - 0.01);

  // Survivor selection pressure
  if (stagnation > 10) survivors = Math.min(0.9, survivors + 0.05);

  // Episode budget: more episodes when stagnating (thorough eval),
  // fewer when improving (fast eval)
  if (stagnation > 6 && eps < 10) eps++;
  if (isImproving && eps > 2) eps--;

  return deepFreeze({
    ...ctrl,
    populationSize: popSize,
    elitismFraction: elitism,
    survivorFraction: survivors,
    episodesPerIndividual: eps,
  } as GAControlGenome);
}

/**
 * Check if any termination condition is met.
 * Returns { shouldStop: boolean, reason?: string }
 */
export function checkTerminationConditions(
  generation: number,
  bestFitness: number,
  stagnation: number,
  elapsedMs: number,
  ctrl: DeepReadonly<GAControlGenome>
): { shouldStop: boolean; reason?: string } {
  if (bestFitness >= ctrl.rewardThreshold) {
    return { shouldStop: true, reason: 'Reward threshold reached' };
  }
  if (stagnation >= ctrl.stagnationPatience) {
    return { shouldStop: true, reason: 'Stagnation patience exceeded' };
  }
  if (generation >= ctrl.maxGenerations) {
    return { shouldStop: true, reason: 'Max generations reached' };
  }
  if (elapsedMs >= ctrl.timeBudgetMs) {
    return { shouldStop: true, reason: 'Time budget exceeded' };
  }
  return { shouldStop: false };
}
