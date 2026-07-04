import type { Agent } from "../neural-network/agent";

/** Configuration for epsilon-greedy exploration decay and discount factor. */
export interface StateManagerConfig {
	epsilonStart?: number;
	epsilonMin?: number;
	epsilonDecay?: number; // multiplicative per step
	gamma?: number;
}

/** Manages epsilon-greedy exploration schedule and agent weight initialisation from genomes. */
export class StateManager {
	private _epsilon: number;
	private readonly _gamma: number;

	constructor(private readonly _cfg: StateManagerConfig = {}) {
		this._epsilon = _cfg.epsilonStart ?? 1.0;
		this._gamma = _cfg.gamma ?? 0.99;
	}

	getEpsilon(): number {
		return this._epsilon;
	}

	getGamma(): number {
		return this._gamma;
	}

	/** Decay epsilon multiplicatively towards its configured minimum. */
	decayEpsilon(): void {
		const decay = this._cfg.epsilonDecay ?? 0.995;
		const minV = this._cfg.epsilonMin ?? 0.01;
		this._epsilon = Math.max(minV, this._epsilon * decay);
	}

	/** Reset epsilon to its configured starting value (e.g. at episode start). */
	resetEpsilon(): void {
		this._epsilon = this._cfg.epsilonStart ?? 1.0;
	}

	/** Initialise agent weights from a flat genome buffer or broadcast a scalar with noise. */
	public initialiseFromGenome(
		agent: Agent,
		genome: Float32Array | number
	): void {
		if (typeof genome === "number") {
			// broadcast scalar around weights
			agent.distributeAroundWeights(genome, 0.1);
		} else {
			// direct weight copy if length matches
			try {
				agent.setWeights(genome);
			} catch {
				agent.distributeAroundWeights(0, 0.01);
			}
		}
	}
}

export default StateManager;
