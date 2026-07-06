import { InitialisationType } from "./type";
import { GAUSSIAN_NOISE } from "./utils";

export interface WeightInitializer {
	initialize(fanIn: number, fanOut: number): number;
}

class ZerosInitializer implements WeightInitializer {
	initialize(): number {
		return 0;
	}
}

class HeInitializer implements WeightInitializer {
	initialize(fanIn: number): number {
		const scale = Math.sqrt(2 / fanIn);
		return GAUSSIAN_NOISE(scale);
	}
}

class XavierInitializer implements WeightInitializer {
	initialize(fanIn: number, fanOut: number): number {
		const limit = Math.sqrt(6 / (fanIn + fanOut));
		return (Math.random() * 2 - 1) * limit;
	}
}

class LeCunInitializer implements WeightInitializer {
	initialize(fanIn: number): number {
		const scale = Math.sqrt(1 / fanIn);
		return GAUSSIAN_NOISE(scale);
	}
}

class RandomInitializer implements WeightInitializer {
	initialize(): number {
		return Math.random() * 2 - 1;
	}
}

export const ZEROS = new ZerosInitializer();
export const HE = new HeInitializer();
export const XAVIER = new XavierInitializer();
export const LE_CUN = new LeCunInitializer();
export const RANDOM_INIT = new RandomInitializer();

export const INITIALIZERS: Record<InitialisationType, WeightInitializer> = {
	[InitialisationType.Zeros]: ZEROS,
	[InitialisationType.He]: HE,
	[InitialisationType.Xavier]: XAVIER,
	[InitialisationType.LeCun]: LE_CUN,
	[InitialisationType.Random]: RANDOM_INIT,
};
