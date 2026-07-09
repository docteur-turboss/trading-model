import type { LayerDims } from "../layer-dims";
import type { WeightInitializer } from "./weight-initializer";

export class ZerosInitializer implements WeightInitializer {
	initialize(_dims: LayerDims): number {
		return 0;
	}
}
