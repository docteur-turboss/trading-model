import type { LayerDims } from "../layer-dims";
import { GAUSSIAN_NOISE } from "../utils";
import type { WeightInitializer } from "./weight-initializer";

export class LeCunInitializer implements WeightInitializer {
	initialize(dims: LayerDims): number {
		const scale = Math.sqrt(1 / dims.fanIn);
		return GAUSSIAN_NOISE(scale);
	}
}
