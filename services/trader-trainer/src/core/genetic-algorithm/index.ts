export type { StopCondition } from "./adaptive-control-system";
export {
	adaptGAControl,
	checkTerminationConditions,
} from "./adaptive-control-system";
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
export {
	computeAdjustedFitness,
	estimateComplexity,
} from "./complexity-estimator";
export { crossoverGenomes, crossoverScalar } from "./crossover";
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
export {
	decodeGenome,
	decodePopulation,
	ENCODED_DIM,
	encodeGenome,
	encodePopulation,
} from "./encoding";
export { evaluateGenomeAllWindows, pooledEval } from "./evaluation-pipeline";
export {
	crossoverGenomes as crossoverGenomesEvolution,
	crossoverWeights,
	mutateGenome as mutateGenomeEvolution,
	mutateWeights,
	selectParent as selectParentEvolution,
} from "./evolution-engine";
export { createDefaultGenome } from "./factory";
export { computeFitness, shapeReward } from "./fitness";
export type {
	GARunnerConfig,
	GenerationContext,
	WindowSet,
} from "./ga-runner";
export { GeneticAlgorithmRunner } from "./ga-runner";
export { adaptSigma, mutateGenome, mutateLayer } from "./mutation";
export {
	sampleCauchy,
	sampleGaussian,
	sampleLevy,
	sampleNoise,
	sampleUniform,
} from "./noise";
export type { ObjectiveVector, PopulationMeta } from "./pareto";
export { buildPopulationMeta, dominates, ParetoArchive } from "./pareto";
export { makePRNG } from "./prng";
export type { BackendFactory, RLBackend } from "./rl-backend";
export { makeTradingAgentBackend } from "./rl-backend";
export { selectParent } from "./selection";
export { clamp, generateId } from "./utils";
export type { ValidationError, ValidationResult } from "./validation";
export { repairGenome, validateGenome } from "./validation";
