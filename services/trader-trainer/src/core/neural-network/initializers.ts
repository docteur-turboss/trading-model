import type { InitialisationType } from "./type";
import { GAUSSIAN_NOISE } from "./utils";

export interface WeightInitializer {
	initialize(fanIn: number, fanOut: number): number;
}

export const INITIALIZERS: Record<InitialisationType, WeightInitializer> = {
	zeros: {
		initialize: () => 0,
	},

	he: {
		initialize: (fanIn: number) => {
			const scale = Math.sqrt(2 / fanIn);
			return GAUSSIAN_NOISE(scale);
		},
	},

	xavier: {
		initialize: (fanIn: number, fanOut: number) => {
			const limit = Math.sqrt(6 / (fanIn + fanOut));
			return (Math.random() * 2 - 1) * limit;
		},
	},

	leCun: {
		initialize: (fanIn: number) => {
			const scale = Math.sqrt(1 / fanIn);
			return GAUSSIAN_NOISE(scale);
		},
	},

	random: {
		initialize: () => {
			return Math.random() * 2 - 1;
		},
	},
};
