import type { WeightInitializer } from "./initializers/weight-initializer";
import type { LayerDims } from "./layer-dims";
import { InitialisationType } from "./type";
import { GAUSSIAN_NOISE } from "./utils";

export type { WeightInitializer } from "./initializers/weight-initializer";

const Zeros: WeightInitializer = { initialize: () => 0 };
const Random: WeightInitializer = { initialize: () => Math.random() * 2 - 1 };
const He: WeightInitializer = {
	initialize: (dims: LayerDims) => {
		const scale = Math.sqrt(2 / dims.fanIn);
		return GAUSSIAN_NOISE(scale);
	},
};
const Xavier: WeightInitializer = {
	initialize: (dims: LayerDims) => {
		const limit = Math.sqrt(6 / (dims.fanIn + dims.fanOut));
		return (Math.random() * 2 - 1) * limit;
	},
};
const LeCun: WeightInitializer = {
	initialize: (dims: LayerDims) => {
		const scale = Math.sqrt(1 / dims.fanIn);
		return GAUSSIAN_NOISE(scale);
	},
};

export const ZEROS = Zeros;
export const HE = He;
export const XAVIER = Xavier;
export const LE_CUN = LeCun;
export const RANDOM_INIT = Random;

export const INITIALIZERS: Record<InitialisationType, WeightInitializer> = {
	[InitialisationType.Zeros]: ZEROS,
	[InitialisationType.He]: HE,
	[InitialisationType.Xavier]: XAVIER,
	[InitialisationType.LeCun]: LE_CUN,
	[InitialisationType.Random]: RANDOM_INIT,
};
