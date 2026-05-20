import { Agent } from '../neural-network/agent';

export type StateManagerConfig = {
  epsilonStart?: number;
  epsilonMin?: number;
  epsilonDecay?: number; // multiplicative per step
  gamma?: number;
};

export class StateManager {
  private epsilon: number;
  public readonly gamma: number;

  constructor(private readonly cfg: StateManagerConfig = {}) {
    this.epsilon = cfg.epsilonStart ?? 1.0;
    this.gamma = cfg.gamma ?? 0.99;
  }

  getEpsilon(): number {
    return this.epsilon;
  }

  decayEpsilon(): void {
    const decay = this.cfg.epsilonDecay ?? 0.995;
    const minV = this.cfg.epsilonMin ?? 0.01;
    this.epsilon = Math.max(minV, this.epsilon * decay);
  }

  resetEpsilon(): void {
    this.epsilon = this.cfg.epsilonStart ?? 1.0;
  }

  /** Initialise agent weights from a flat genome buffer or scalar reference */
  public initialiseFromGenome(agent: Agent, genome: Float32Array | number): void {
    if (typeof genome === 'number') {
      // broadcast scalar around weights
      agent.nn.distributeAroundWeights(genome, 0.1);
    } else {
      // direct weight copy if length matches
      try {
        agent.nn.setWeights(genome);
      } catch (_e) {
        void _e;
        agent.nn.distributeAroundWeights(0, 0.01);
      }
    }
  }
}

export default StateManager;
