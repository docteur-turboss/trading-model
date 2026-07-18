import { ActivationType, ConnectionType } from "../neural-network/type";

enum LayerField {
	Neurons = 0,
	Activation = 1,
	ConnectionType = 2,
}

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
