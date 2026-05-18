// ================================================================
//   index.ts — Public API & usage example
// ================================================================

// Core primitives
export { clamp, generateId }                         from "./utils";
export { makePRNG }                                   from "./prng";
export { sampleNoise, sampleGaussian,
         sampleCauchy, sampleUniform, sampleLevy }   from "./noise";

// Genome lifecycle
export { createDefaultGenome }                        from "./factory";
export { mutateGenome, mutateLayer, adaptSigma }      from "./mutation";
export { crossoverGenomes, crossoverScalar }          from "./crossover";
export { selectParent }                               from "./selection";
export { computeFitness, shapeReward }                from "./fitness";

// Validation & repair
export type { ValidationResult, ValidationError }     from "./validation";
export { validateGenome, repairGenome }               from "./validation";

// Complexity & topology
export type { TopologyConstraints, TopologyViolation } from "./complexity";
export { DEFAULT_TOPOLOGY_CONSTRAINTS,
         complexityScore, countParams,
         checkTopologyConstraints,
         penalisedFitness, rejectIfViolating }        from "./complexity";

// Diversity & novelty
export type { Species, DiversityMetrics }             from "./diversity";
export { genomicDistance, speciate,
         diversityMetrics, noveltyScore,
         updateNoveltyArchive }                       from "./diversity";

// Compact vectorised encoding
export { ENCODED_DIM,
         encodeGenome, decodeGenome,
         encodePopulation, decodePopulation }         from "./encoding";

// Main orchestrator
export { GeneticAlgorithmRunner, makeTradingAgentBackend } from "./ga_runner";
export type { RLBackend, WindowSet, GARunnerConfig, GenerationContext } from "./ga_runner";

// Evaluation pipeline
export { evaluateGenomeAllWindows, pooledEval } from "./evaluation_pipeline";
export type { BackendFactory } from "./evaluation_pipeline";

// Pareto optimization (NSGA-II)
export { ParetoArchive, buildPopulationMeta, dominates } from "./pareto_engine";
export type { ObjectiveVector, PopulationMeta } from "./pareto_engine";

// Complexity estimation
export { estimateComplexity, computeAdjustedFitness } from "./complexity_estimator";
export type { ComplexityProfile } from "./complexity_estimator";

// Adaptive control system
export { adaptGAControl, checkTerminationConditions } from "./adaptive_control_system";

// Evolution engine (genetic operators)
export {
  crossoverWeights,
  mutateWeights,
  selectParent as selectParentEvolution,
  mutateGenome as mutateGenomeEvolution,
  crossoverGenomes as crossoverGenomesEvolution,
} from "./evolution_engine";