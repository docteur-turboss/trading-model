import { EluActivation } from "./activations/elu";
import { GeluActivation } from "./activations/gelu";
import { LeakyReluActivation } from "./activations/leaky-relu";
import { MishActivation } from "./activations/mish";
import { ReluActivation } from "./activations/relu";
import { SigmoidActivation } from "./activations/sigmoid";
import { SoftmaxActivation } from "./activations/softmax";
import { TanhActivation } from "./activations/tanh";
import { ActivationType } from "./type";

export type { ActivationDefinition } from "./activations/activation-interface";

export const SIGMOID = new SigmoidActivation();
export const TANH = new TanhActivation();
export const RELU = new ReluActivation();
export const LEAKY_RELU = new LeakyReluActivation();
export const ELU = new EluActivation();
export const GELU = new GeluActivation();
export const MISH = new MishActivation();
export const SOFTMAX = new SoftmaxActivation();

export const ACTIVATIONS: Record<
	ActivationType,
	import("./activations/activation-interface").ActivationDefinition
> = {
	[ActivationType.Sigmoid]: SIGMOID,
	[ActivationType.Tanh]: TANH,
	[ActivationType.Relu]: RELU,
	[ActivationType.LeakyReLu]: LEAKY_RELU,
	[ActivationType.Elu]: ELU,
	[ActivationType.Gelu]: GELU,
	[ActivationType.Mish]: MISH,
	[ActivationType.Softmax]: SOFTMAX,
};
