import { describe, expect, test } from "@jest/globals";
import { FeatureVector } from "../src/feature-vector";
import { FEATURE_DIM } from "../src/feature-vector-codec";
import { FeedForwardEngine } from "../src/neural-network/feed-forward-engine";
import {
	getWeights,
	parameterCount,
	setWeights,
} from "../src/neural-network/network-serialization";
import {
	ActivationType,
	ConnectionType,
	type LayerMemory,
	mergeConfig,
} from "../src/neural-network/type";

function layer(
	fanIn: number,
	fanOut: number,
	w: number,
	b: number
): LayerMemory {
	const z = () => new Float32Array(fanOut);
	return {
		fanIn,
		fanOut,
		weights: new Float32Array(fanIn * fanOut).fill(w),
		bias: new Float32Array(fanOut).fill(b),
		gradW: new Float32Array(fanIn * fanOut),
		gradB: z(),
	} as unknown as LayerMemory;
}

function engine(connectionType: ConnectionType, layers: LayerMemory[]) {
	const config = mergeConfig({
		neuronsByLayer: [2, 2, 1] as never,
		activationType: [ActivationType.Linear, ActivationType.Linear],
		connectionType,
	});
	return new FeedForwardEngine(config, layers);
}

describe("FeedForwardEngine", () => {
	test("computes a linear two-layer pass", () => {
		const layers = [layer(2, 2, 1, 0), layer(2, 1, 1, 1)];
		const ctx = engine(ConnectionType.FullyConnected, layers).forward(
			new Float32Array([1, 2])
		);
		// layer 1: [3, 3]; layer 2: 3 + 3 + 1
		expect(Array.from(ctx.output)).toEqual([7]);
		expect(ctx.layerOutputs).toHaveLength(2);
	});

	test("without normalisation, leaves the input untouched and uncopied", () => {
		const input = new Float32Array([1, 2]);
		const ctx = engine(ConnectionType.FullyConnected, [
			layer(2, 2, 1, 0),
			layer(2, 1, 1, 1),
		]).forward(input);
		expect(ctx.input).toBe(input);
		expect(Array.from(input)).toEqual([1, 2]);
		expect(Array.from(ctx.output)).toEqual([7]);
	});

	test("keeps pre-activations apart from activated outputs", () => {
		const layers = [layer(2, 2, 1, 0), layer(2, 1, 1, 1)];
		const config = mergeConfig({
			neuronsByLayer: [2, 2, 1] as never,
			activationType: [ActivationType.Linear, ActivationType.Sigmoid],
			connectionType: ConnectionType.FullyConnected,
		});
		const ctx = new FeedForwardEngine(config, layers).forward(
			new Float32Array([1, 2])
		);
		expect(Array.from(ctx.layerZValues[1])).toEqual([7]);
		expect(ctx.layerOutputs[1][0]).toBeCloseTo(1 / (1 + Math.exp(-7)));
	});

	test("dense-skip adds the input where sizes match", () => {
		const layers = [layer(2, 2, 1, 0), layer(2, 1, 1, 0)];
		const ctx = engine(ConnectionType.DenseSkip, layers).forward(
			new Float32Array([1, 2])
		);
		expect(Array.from(ctx.layerOutputs[0])).toEqual([4, 5]);
	});

	test("residual adds the layer input to hidden layers, truncated or zero-padded", () => {
		const cfg = (neurons: number[]) =>
			mergeConfig({
				neuronsByLayer: neurons as never,
				activationType: [ActivationType.Linear, ActivationType.Linear],
				connectionType: ConnectionType.ResidualConnection,
			});
		const same = new FeedForwardEngine(cfg([2, 2, 1]), [
			layer(2, 2, 1, 0),
			layer(2, 1, 1, 0),
		]).forward(new Float32Array([1, 2]));
		expect(Array.from(same.layerOutputs[0])).toEqual([4, 5]);
		expect(Array.from(same.output)).toEqual([9]);
		// same genome, same input: FullyConnected gives 3 + 3 = 6, so the residual is not a duplicate
		const fully = engine(ConnectionType.FullyConnected, [
			layer(2, 2, 1, 0),
			layer(2, 1, 1, 0),
		]).forward(new Float32Array([1, 2]));
		expect(Array.from(fully.output)).toEqual([6]);
		const pad = new FeedForwardEngine(cfg([2, 3, 1]), [
			layer(2, 3, 1, 0),
			layer(3, 1, 1, 0),
		]).forward(new Float32Array([1, 2]));
		expect(Array.from(pad.layerOutputs[0])).toEqual([4, 5, 3]);
		const cut = new FeedForwardEngine(cfg([3, 2, 1]), [
			layer(3, 2, 1, 0),
			layer(2, 1, 1, 0),
		]).forward(new Float32Array([1, 2, 3]));
		expect(Array.from(cut.layerOutputs[0])).toEqual([7, 8]);
	});

	test("rejects a wrong input size", () => {
		const e = engine(ConnectionType.FullyConnected, [layer(2, 2, 1, 0)]);
		expect(() => e.forward(new Float32Array(3))).toThrow(
			/Expected input size 2/
		);
	});
});

describe("network serialization", () => {
	test("round-trips weights and validates lengths", () => {
		const layers = [layer(2, 2, 1, 0), layer(2, 1, 1, 1)];
		expect(parameterCount(layers)).toBe(9);
		const flat = getWeights(layers);
		const other = [layer(2, 2, 0, 0), layer(2, 1, 0, 0)];
		setWeights(other, flat);
		expect(getWeights(other)).toEqual(flat);
		expect(() => setWeights(other, new Float32Array(1))).toThrow(/mismatch/);
	});
});

describe("feature vector codec", () => {
	test("encode then decode restores every input", () => {
		const data = Float32Array.from({ length: FEATURE_DIM }, (_, i) => i + 1);
		const fv = FeatureVector.fromFloat32Array(data);
		expect(fv.candle.close).toBe(1);
		expect(fv.bias).toBe(FEATURE_DIM);
		expect(fv.toFloat32Array()).toEqual(data);
	});
});
