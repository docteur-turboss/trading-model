// ================================================================
//   index.ts — Public API & usage example
// ================================================================

export type { StopCondition } from "./adaptive-control-system";
// Adaptive control system
export {
	adaptGAControl,
	checkTerminationConditions,
} from "./adaptive-control-system";
// Complexity & topology
export type { TopologyConstraints, TopologyViolation } from "./complexity";
export {
	checkTopologyConstraints,
	complexityScore,
	countParams,
	DEFAULT_TOPOLOGY_CONSTRAINTS,
	penalisedFitness,
	rejectIfViolating,
} from "./complexity";
export type { ComplexityProfile } from "./complexity-estimator";
// Complexity estimation
export {
	computeAdjustedFitness,
	estimateComplexity,
} from "./complexity-estimator";
export { crossoverGenomes, crossoverScalar } from "./crossover";
// Diversity & novelty
export type {
	DiversityMetrics,
	NoveltyArchiveConfig,
	Species,
} from "./diversity";
export {
	diversityMetrics,
	genomicDistance,
	noveltyScore,
	speciate,
	updateNoveltyArchive,
} from "./diversity";
// Compact vectorised encoding
export {
	decodeGenome,
	decodePopulation,
	ENCODED_DIM,
	encodeGenome,
	encodePopulation,
} from "./encoding";
export type { BackendFactory } from "./evaluation-pipeline";
// Evaluation pipeline
export { evaluateGenomeAllWindows, pooledEval } from "./evaluation-pipeline";
// Evolution engine (genetic operators)
export {
	crossoverGenomes as crossoverGenomesEvolution,
	crossoverWeights,
	mutateGenome as mutateGenomeEvolution,
	mutateWeights,
	selectParent as selectParentEvolution,
} from "./evolution-engine";
// Genome lifecycle
export { createDefaultGenome } from "./factory";
export { computeFitness, shapeReward } from "./fitness";
export type {
	GARunnerConfig,
	GenerationContext,
	RLBackend,
	WindowSet,
} from "./ga-runner";
// Main orchestrator
export { GeneticAlgorithmRunner, makeTradingAgentBackend } from "./ga-runner";
export { adaptSigma, mutateGenome, mutateLayer } from "./mutation";
export {
	sampleCauchy,
	sampleGaussian,
	sampleLevy,
	sampleNoise,
	sampleUniform,
} from "./noise";
export type { ObjectiveVector, PopulationMeta } from "./pareto-engine";
// Pareto optimization (NSGA-II)
export { buildPopulationMeta, dominates, ParetoArchive } from "./pareto-engine";
export { makePRNG } from "./prng";
export { selectParent } from "./selection";
// Core primitives
export { clamp, generateId } from "./utils";
// Validation & repair
export type { ValidationError, ValidationResult } from "./validation";
export { repairGenome, validateGenome } from "./validation";
