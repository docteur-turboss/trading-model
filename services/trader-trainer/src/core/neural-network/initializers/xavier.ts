import type { LayerDims } from "../layer-dims";
import type { WeightInitializer } from "./weight-initializer";

export class XavierInitializer implements WeightInitializer {
	initialize(dims: LayerDims): number {
		const limit = Math.sqrt(6 / (dims.fanIn + dims.fanOut));
		return (Math.random() * 2 - 1) * limit;
	}
}
