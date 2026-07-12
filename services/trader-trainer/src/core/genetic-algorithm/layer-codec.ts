import { ActivationType, ConnectionType } from "../neural-network/type";

const OFFSET_NEURONS = 0;
const OFFSET_ACTIVATION = 1;
const OFFSET_CONNECTION = 2;
export const LAYER_STRIDE = 3;

class ActivationCodec {
	private readonly _toCode: Map<ActivationType, number>;
	private readonly _fromCode: Map<number, ActivationType>;
	private readonly _default: ActivationType;

	constructor(entries: [number, ActivationType][], default_: ActivationType) {
		this._fromCode = new Map(entries);
		this._toCode = new Map(entries.map(([key, value]) => [value, key]));
		this._default = default_;
	}

	encode(type: ActivationType): number {
		return this._toCode.get(type) ?? this._toCode.get(this._default)!;
	}

	decode(code: number): ActivationType {
		return this._fromCode.get(Math.round(code)) ?? this._default;
	}

	allValues(): ActivationType[] {
		return Array.from(this._toCode.keys());
	}
}

class ConnectionTypeCodec {
	private readonly _toCode: Map<ConnectionType, number>;
	private readonly _fromCode: Map<number, ConnectionType>;
	private readonly _default: ConnectionType;

	constructor(entries: [number, ConnectionType][], default_: ConnectionType) {
		this._fromCode = new Map(entries);
		this._toCode = new Map(entries.map(([key, value]) => [value, key]));
		this._default = default_;
	}

	encode(type: ConnectionType): number {
		return this._toCode.get(type) ?? this._toCode.get(this._default)!;
	}

	decode(code: number): ConnectionType {
		return this._fromCode.get(Math.round(code)) ?? this._default;
	}

	allValues(): ConnectionType[] {
		return Array.from(this._toCode.keys());
	}
}

const ACTIVATION_CODEC = new ActivationCodec(
	Object.values(ActivationType).map((type, index) => [index, type]),
	ActivationType.Relu
);

const CONNECTION_TYPE_CODEC = new ConnectionTypeCodec(
	Object.values(ConnectionType).map((type, index) => [index, type]),
	ConnectionType.DenseSkip
);

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
		neurons: arr[offset + OFFSET_NEURONS],
		activation: ACTIVATION_CODEC.decode(arr[offset + OFFSET_ACTIVATION]),
		connectionType: CONNECTION_TYPE_CODEC.decode(
			arr[offset + OFFSET_CONNECTION]
		),
	};
}

export function writeEncodedLayer(
	arr: Float32Array,
	offset: number,
	layer: EncodedLayer
): void {
	arr[offset + OFFSET_NEURONS] = layer.neurons;
	arr[offset + OFFSET_ACTIVATION] = ACTIVATION_CODEC.encode(layer.activation);
	arr[offset + OFFSET_CONNECTION] = CONNECTION_TYPE_CODEC.encode(
		layer.connectionType
	);
}
