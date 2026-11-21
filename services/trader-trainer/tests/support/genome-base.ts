import { NumericRange } from "@trading-model/primitives/numeric-range";

/** Genome fields shared by the GA specs; each spec adds its own `network` and `gaControl`. */
export const GENOME_BASE = {
	id: "test",
	generation: 0,
	rl: {
		gamma: 0.99,
		learningRate: 0.001,
		discretePolicy: {
			epsilonStart: 1.0,
			epsilonMin: 0.01,
			epsilonDecay: 0.995,
		},
		replayBuffer: {
			bufferSize: 128,
			prioritized: false,
			alphaPER: 0.6,
			betaPER: 0.4,
			betaAnneal: false,
		},
		horizon: { maxEpisodeLength: 100, frameSkip: 1, nStepReturn: 3 },
		rewardShaping: {
			clip: false,
			clipBounds: new NumericRange(-1, 1),
			scale: false,
			scaleFactor: 1,
			normalize: false,
			sparse: false,
		},
	},
	mutation: {
		rate: 0.1,
		sigma: 0.5,
		addNeuronRate: 0.1,
		removeNeuronRate: 0.1,
		addLayerRate: 0.1,
		removeLayerRate: 0.1,
	},
	crossover: {
		probability: 0.5,
	},
};
