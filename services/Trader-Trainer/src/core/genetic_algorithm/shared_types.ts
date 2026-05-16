/**
 * Shared type definitions for GA module.
 * Centralized to avoid circular dependencies between modules.
 */

export type { Genome, GAControlGenome, LamarckGenome, MarketStep } from "./genome_types";
export type { Experience } from "core/neural_network/type";

export type DeepReadonly<T> =
  T extends (infer U)[] ? ReadonlyArray<DeepReadonly<U>> :
  T extends object      ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T;
