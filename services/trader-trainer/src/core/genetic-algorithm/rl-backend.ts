import type { DeepReadonly, LamarckGenome } from './shared-types';
import type { Experience } from '../../core/neural-network/type';

/**
 * RL backend interface decouples the GA runner and evaluation pipeline
 * from concrete DQN / TradingAgent internals.
 */
export interface RLBackend {
  /** Pure network inference — no pool interaction. */
  forwardPass(features: Float32Array): Float32Array;
  /** Full environment step: sets price, runs inference, executes trade, pushes experience. */
  step(features: Float32Array, price: number): { reward: number };
  /** Q-learning update on one experience tuple. */
  train(experience: Experience, gamma: number): void;
  /** Flat weight snapshot for Lamarckian storage. */
  getWeights(): Float32Array;
  /** Restore weights from a Lamarckian snapshot. */
  setWeights(w: Float32Array): void;
  getPnL(): number;
  /** Resets episode state — wallet, pool, and internal counters. */
  resetEpisode(): void;
  getExperiencePool(): Experience[];
}

/** Factory: creates a fresh RLBackend from a genome. */
export type BackendFactory = (g: DeepReadonly<LamarckGenome>) => RLBackend;
