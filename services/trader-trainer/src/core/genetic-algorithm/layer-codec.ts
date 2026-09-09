import { ActivationType, ConnectionType } from "../neural-network/type";

enum LayerField {
	Neurons = 0,
	Activation = 1,
	ConnectionType = 2,
}

export const LAYER_STRIDE = LayerField.ConnectionType + 1;

class EnumCodec<TValue extends string> {
	private readonly _toCode: Map<TValue, number>;
	private readonly _fromCode: Map<number, TValue>;
	private readonly _default: TValue;

	constructor(entries: [number, TValue][], default_: TValue) {
		this._fromCode = new Map(entries);
		this._toCode = new Map(entries.map(([key, value]) => [value, key]));
		this._default = default_;
	}

	encode(type: TValue): number {
		return this._toCode.get(type) ?? this._toCode.get(this._default)!;
	}

	decode(code: number): TValue {
		return this._fromCode.get(Math.round(code)) ?? this._default;
	}

	allValues(): TValue[] {
		return Array.from(this._toCode.keys());
	}
}

const ACTIVATION_CODEC = new EnumCodec<ActivationType>(
	Object.values(ActivationType)
		.filter((type) => type !== ActivationType.Softmax)
		.map((type, index) => [index, type]),
	ActivationType.Relu
);

const CONNECTION_TYPE_CODEC = new EnumCodec<ConnectionType>(
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

export class EncodedLayer {
	constructor(
		readonly neurons: number,
		readonly activation: ActivationType,
		readonly connectionType: ConnectionType
	) {}

	static read(arr: Float32Array, offset: number): EncodedLayer {
		return new EncodedLayer(
			arr[offset + LayerField.Neurons],
			ACTIVATION_CODEC.decode(arr[offset + LayerField.Activation]),
			CONNECTION_TYPE_CODEC.decode(arr[offset + LayerField.ConnectionType])
		);
	}

	write(arr: Float32Array, offset: number): void {
		arr[offset + LayerField.Neurons] = this.neurons;
		arr[offset + LayerField.Activation] = ACTIVATION_CODEC.encode(
			this.activation
		);
		arr[offset + LayerField.ConnectionType] = CONNECTION_TYPE_CODEC.encode(
			this.connectionType
		);
	}
}

/** @deprecated Use {@link EncodedLayer.read} instead */
export function readEncodedLayer(
	arr: Float32Array,
	offset: number
): EncodedLayer {
	return EncodedLayer.read(arr, offset);
}

/** @deprecated Use {@link EncodedLayer.write} instead */
export function writeEncodedLayer(
	arr: Float32Array,
	offset: number,
	layer: EncodedLayer
): void {
	layer.write(arr, offset);
}
