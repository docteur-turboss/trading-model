import type { LayerDims } from "../layer-dims";
import type { WeightInitializer } from "./weight-initializer";

export class RandomInitializer implements WeightInitializer {
	initialize(_dims: LayerDims): number {
		return Math.random() * 2 - 1;
	}
}
