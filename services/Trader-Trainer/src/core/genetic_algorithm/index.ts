// ================================================================
//   index.ts — Public API & usage example
// ================================================================

export { GeneticAlgorithmRunner } from "./ga_runner";
export type { GARunnerConfig, GenerationContext } from "./ga_runner";
export {
  createDefaultGenome,
  mutateGenome,
  crossoverGenomes,
  selectParent,
  computeFitness,
  shapeReward,
  makePRNG,
  sampleNoise,
  generateId,
  clamp,
} from "./ga_genome_utils";
export * from "./genome_types";

// ================================================================
//   USAGE EXAMPLE
// ================================================================
/*

import { GeneticAlgorithmRunner, createDefaultGenome } from "./genetic_algorithm";
import type { MarketStep, GAControlGenome } from "./genetic_algorithm";

// 1. Build your market data stream
const marketData: MarketStep[] = myPriceHistory.map(bar => ({
  price:    bar.close,
  features: new Float32Array([
    bar.open, bar.high, bar.low, bar.close, bar.volume,
    bar.rsi, bar.macd, bar.signal,
    // ... up to inputDim features
  ]),
  timestamp: bar.ts,
}));

// 2. Configure the runner
const runner = new GeneticAlgorithmRunner({
  marketData,
  initialControl: {
    populationSize:  30,
    maxGenerations:  50,
    timeBudgetMs:    10 * 60 * 1000,   // 10 minutes
    stagnationPatience: 12,
    fitnessType:     "sharpe",
    selectionType:   "tournament",
    episodesPerIndividual: 3,
    seedsPerEval:    2,
    envSeed:         42,
    mutationSeed:    1337,
    networkSeed:     7,
  } satisfies Partial<GAControlGenome>,

  onGeneration: ctx => {
    console.log(
      `Gen ${ctx.generation} | best=${ctx.bestFitness.toFixed(4)} ` +
      `avg=${ctx.avgFitness.toFixed(4)} eff=${ctx.efficiencyScore.toExponential(2)} ` +
      `stag=${ctx.stagnation} pop=${ctx.gaControl.populationSize}`
    );
  },

  onNewBest: (genome, fitness) => {
    console.log(`🏆 New best: ${fitness.toFixed(4)} @ gen ${genome.generation}`);
    console.log(`   Layers:  ${genome.network.hiddenLayers.map(l => l.neurons).join(" → ")}`);
    console.log(`   γ=${genome.rl.gamma.toFixed(3)} lr=${genome.rl.learningRate.toExponential(2)}`);
    console.log(`   Policy:  ${genome.rl.discretePolicy.type}`);
    console.log(`   Fitness: ${genome.gaControl.fitnessType}`);
  },
});

// 3. Run
const bestGenome = await runner.run();
console.log("Best genome:", bestGenome);

*/