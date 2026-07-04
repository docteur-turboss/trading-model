// ================================================================
//                genome validation & repair
// ================================================================
//
// Re-exports from `genome.ts` where validation logic is co-located
// with the types it validates (avoids Feature Envy pattern).

export type { ValidationError, ValidationResult } from "./genome";
export { repairGenome, validateGenome } from "./genome";
