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

// P2 — Validation & repair
export type { ValidationResult, ValidationError }     from "./validation";
export { validateGenome, repairGenome }               from "./validation";

// P3 — Complexity & topology
export type { TopologyConstraints, TopologyViolation } from "./complexity";
export { DEFAULT_TOPOLOGY_CONSTRAINTS,
         complexityScore, countParams,
         checkTopologyConstraints,
         penalisedFitness, rejectIfViolating }        from "./complexity";

// P4 — Diversity & novelty
export type { Species, DiversityMetrics }             from "./diversity";
export { genomicDistance, speciate,
         diversityMetrics, noveltyScore,
         updateNoveltyArchive }                       from "./diversity";

// P5 — Compact vectorised encoding
export { ENCODED_DIM,
         encodeGenome, decodeGenome,
         encodePopulation, decodePopulation }         from "./encoding";