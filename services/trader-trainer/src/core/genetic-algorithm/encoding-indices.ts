import { ActivationType, ConnectionType } from "../neural-network/type";

export const ENCODING_OFFSETS = {
	Gamma: 0,
	LearningRate: 1,
	ClipMin: 2,
	ClipMax: 3,
	ScaleFactor: 4,
	MaxEpisodeLength: 5,
	NStepReturn: 6,
	FrameSkip: 7,
	EpsilonStart: 8,
	EpsilonMin: 9,
	EpsilonDecay: 10,
	Temperature: 11,
	NoiseStd: 12,
	NoiseDecay: 13,
	BufferSize: 14,
	AlphaPER: 15,
	BetaPER: 16,
	MutationRate: 17,
	MutationSigma: 18,
	MutationSelfSigma: 19,
	NetworkInputDim: 20,
	NetworkOutputDim: 21,
	NetworkDepth: 22,
} as const;
type ScalarField = keyof typeof ENCODING_OFFSETS;

export const SCALAR_DIM = 23;
export const MAX_DEPTH = 12;
const LAYER_STRIDE = 3;

function assertOffset(offset: number): void {
	if (offset < 0 || offset >= SCALAR_DIM) {
		throw new RangeError(
			`Scalar offset ${offset} out of range [0, ${SCALAR_DIM})`
		);
	}
}

export function readScalar(arr: Float32Array, field: ScalarField): number {
	const offset = ENCODING_OFFSETS[field];
	assertOffset(offset);
	return arr[offset];
}

export function writeScalar(
	arr: Float32Array,
	field: ScalarField,
	value: number
): void {
	const offset = ENCODING_OFFSETS[field];
	assertOffset(offset);
	arr[offset] = value;
}

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

export function activationFromIndex(idx: number): ActivationType {
	return ACTIVATIONS[idx] ?? ACTIVATIONS[0];
}

export function connectionTypeFromIndex(idx: number): ConnectionType {
	return CONNECTION_TYPES[idx] ?? CONNECTION_TYPES[0];
}

export function encodedDim(hiddenLayerCount: number): number {
	return SCALAR_DIM + hiddenLayerCount * LAYER_STRIDE;
}

export function layerOffset(layerIndex: number): number {
	return SCALAR_DIM + layerIndex * LAYER_STRIDE;
}

export interface EncodedLayer {
	neurons: number;
	activationIdx: number;
	connectionTypeIdx: number;
}

export function readEncodedLayer(
	arr: Float32Array,
	offset: number
): EncodedLayer {
	return {
		neurons: arr[offset],
		activationIdx: Math.round(arr[offset + 1]),
		connectionTypeIdx: Math.round(arr[offset + 2]),
	};
}

export function writeEncodedLayer(
	arr: Float32Array,
	offset: number,
	layer: EncodedLayer
): void {
	arr[offset] = layer.neurons;
	arr[offset + 1] = layer.activationIdx;
	arr[offset + 2] = layer.connectionTypeIdx;
}
