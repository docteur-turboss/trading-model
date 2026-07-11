import { ActivationType, ConnectionType } from "../neural-network/type";

export const LAYER_FIELDS = [
	"neurons",
	"activation",
	"connectionType",
] as const;
export const LAYER_STRIDE = LAYER_FIELDS.length;

class ActivationCodec {
	private readonly _toCode: Map<ActivationType, number>;
	private readonly _fromCode: Map<number, ActivationType>;

	constructor(entries: [number, ActivationType][]) {
		this._fromCode = new Map(entries);
		this._toCode = new Map(entries.map(([key, value]) => [value, key]));
	}

	encode(type: ActivationType): number {
		return this._toCode.get(type) ?? 0;
	}

	decode(code: number): ActivationType {
		return this._fromCode.get(Math.round(code)) ?? this._fromCode.get(0)!;
	}

	allValues(): ActivationType[] {
		return Array.from(this._toCode.keys());
	}
}

class ConnectionTypeCodec {
	private readonly _toCode: Map<ConnectionType, number>;
	private readonly _fromCode: Map<number, ConnectionType>;

	constructor(entries: [number, ConnectionType][]) {
		this._fromCode = new Map(entries);
		this._toCode = new Map(entries.map(([key, value]) => [value, key]));
	}

	encode(type: ConnectionType): number {
		return this._toCode.get(type) ?? 0;
	}

	decode(code: number): ConnectionType {
		return this._fromCode.get(Math.round(code)) ?? this._fromCode.get(0)!;
	}

	allValues(): ConnectionType[] {
		return Array.from(this._toCode.keys());
	}
}

const ACTIVATION_CODEC = new ActivationCodec([
	[0, ActivationType.Relu],
	[1, ActivationType.Sigmoid],
	[2, ActivationType.Tanh],
	[3, ActivationType.LeakyReLu],
	[4, ActivationType.Elu],
	[5, ActivationType.Mish],
	[6, ActivationType.Gelu],
	[7, ActivationType.Softmax],
]);

const CONNECTION_TYPE_CODEC = new ConnectionTypeCodec([
	[0, ConnectionType.DenseSkip],
	[1, ConnectionType.FullyConnected],
	[2, ConnectionType.ResidualConnection],
]);

export const ACTIVATIONS: ActivationType[] = ACTIVATION_CODEC.allValues();
export const CONNECTION_TYPES: ConnectionType[] =
	CONNECTION_TYPE_CODEC.allValues();

export function activationFromIndex(idx: number): ActivationType {
	return ACTIVATION_CODEC.decode(idx);
}

export function connectionTypeFromIndex(idx: number): ConnectionType {
	return CONNECTION_TYPE_CODEC.decode(idx);
}

export interface EncodedLayer {
	neurons: number;
	activation: ActivationType;
	connectionType: ConnectionType;
}

export function readEncodedLayer(
	arr: Float32Array,
	offset: number
): EncodedLayer {
	return {
		neurons: arr[offset],
		activation: ACTIVATION_CODEC.decode(arr[offset + 1]),
		connectionType: CONNECTION_TYPE_CODEC.decode(arr[offset + 2]),
	};
}

export function writeEncodedLayer(
	arr: Float32Array,
	offset: number,
	layer: EncodedLayer
): void {
	arr[offset] = layer.neurons;
	arr[offset + 1] = ACTIVATION_CODEC.encode(layer.activation);
	arr[offset + 2] = CONNECTION_TYPE_CODEC.encode(layer.connectionType);
}
