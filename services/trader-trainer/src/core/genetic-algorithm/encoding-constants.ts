import {
	ActivationType,
	ConnectionType,
} from "../neural-network/type";
import { SCALAR_DIM } from "./encoding-indices";

export const MAX_DEPTH = 12;

export const ACTIVATIONS: ActivationType[] = [
	ActivationType.Relu,
	ActivationType.Sigmoid,
	ActivationType.Tanh,
	ActivationType.LeakyReLu,
	ActivationType.Elu,
	ActivationType.Mish,
	ActivationType.Gelu,
	ActivationType.Softmax,
];

export const CONNECTION_TYPES: ConnectionType[] = [
	ConnectionType.DenseSkip,
	ConnectionType.FullyConnected,
	ConnectionType.ResidualConnection,
];

export const N_ACT = ACTIVATIONS.length;
export const N_CT = CONNECTION_TYPES.length;
export const LAYER_DIM = 1 + N_ACT + N_CT;

export const ENCODED_DIM = SCALAR_DIM + MAX_DEPTH * LAYER_DIM;
