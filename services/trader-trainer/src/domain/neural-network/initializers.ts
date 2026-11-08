import { sampleGaussian } from "../genetic-algorithm/noise";
import type { LayerDims } from "./layer-dims";
import { InitialisationType } from "./type";

interface WeightInitializer {
	initialize(dims: LayerDims, rng?: () => number): number;
}

const Zeros: WeightInitializer = { initialize: () => 0 };
const Random: WeightInitializer = {
	initialize: (_dims, rng = Math.random) => rng() * 2 - 1,
};
const He: WeightInitializer = {
	initialize: (dims: LayerDims, rng = Math.random) => {
		const scale = Math.sqrt(2 / dims.fanIn);
		return sampleGaussian(rng, scale);
	},
};
const Xavier: WeightInitializer = {
	initialize: (dims: LayerDims, rng = Math.random) => {
		const limit = Math.sqrt(6 / (dims.fanIn + dims.fanOut));
		return (rng() * 2 - 1) * limit;
	},
};
const LeCun: WeightInitializer = {
	initialize: (dims: LayerDims, rng = Math.random) => {
		const scale = Math.sqrt(1 / dims.fanIn);
		return sampleGaussian(rng, scale);
	},
};

export const INITIALIZERS: Record<InitialisationType, WeightInitializer> = {
	[InitialisationType.Zeros]: Zeros,
	[InitialisationType.He]: He,
	[InitialisationType.Xavier]: Xavier,
	[InitialisationType.LeCun]: LeCun,
	[InitialisationType.Random]: Random,
};
