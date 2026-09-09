import { Probability } from "@trading-model/common/domain/primitives";
import type { NeuralNetwork } from "../../domain/neural-network/neural-network";

interface GenomeTarget {
	nn: Pick<NeuralNetwork, "setWeights" | "distributeAroundWeights">;
}

/** Configuration for epsilon-greedy exploration decay and discount factor. */
export interface StateManagerConfig {
	epsilonStart?: number;
	epsilonMin?: number;
	/** Multiplicative decay applied per step. */
	epsilonDecay?: number;
	gamma?: number;
}

/** Manages epsilon-greedy exploration schedule and agent weight initialisation from genomes. */
export class StateManager {
	private _epsilon: number;
	private readonly _gamma: number;

	constructor(private readonly _cfg: StateManagerConfig = {}) {
		this._epsilon = Probability.of(_cfg.epsilonStart ?? 1.0);
		this._gamma = Probability.of(_cfg.gamma ?? 0.99);
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
		agent: GenomeTarget,
		genome: Float32Array | number
	): void {
		if (typeof genome === "number") {
			agent.nn.distributeAroundWeights(genome, 0.1);
		} else {
			try {
				agent.nn.setWeights(genome);
			} catch {
				agent.nn.distributeAroundWeights(0, 0.01);
			}
		}
	}
}

export default StateManager;
