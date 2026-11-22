import { Probability } from "@trading-model/primitives/primitives";

/** Configuration for epsilon-greedy exploration decay and discount factor. */
export interface StateManagerConfig {
	epsilonStart?: number;
	epsilonMin?: number;
	/** Multiplicative decay applied per step. */
	epsilonDecay?: number;
}

/** Manages epsilon-greedy exploration schedule. */
class StateManager {
	private _epsilon: number;

	constructor(private readonly _cfg: StateManagerConfig = {}) {
		this._epsilon = Probability.of(_cfg.epsilonStart ?? 1.0);
	}

	getEpsilon(): number {
		return this._epsilon;
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
}

export default StateManager;
