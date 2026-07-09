import type { LayerDims } from "../layer-dims";

export interface WeightInitializer {
	initialize(dims: LayerDims): number;
}
