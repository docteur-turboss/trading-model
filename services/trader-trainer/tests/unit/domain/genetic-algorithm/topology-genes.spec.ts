import { describe, expect, test } from "@jest/globals";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { policyNetworkConfig } from "@trading-model/model-runtime/replay";
import { createDefaultGenome } from "../../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../../src/domain/genetic-algorithm/genome";
import { crossoverNetwork } from "../../../../src/domain/genetic-algorithm/genome-network/crossover";
import {
	mutateNetworkStructure,
	TOPOLOGY_BOUNDS,
} from "../../../../src/domain/genetic-algorithm/genome-network/mutation";

import { NeuralNetwork } from "../../../../src/domain/neural-network/neural-network";

const base = createDefaultGenome("t") as LamarckGenome;
const layer = base.network.hiddenLayers[0];
const withLayers = (neurons: number[]): LamarckGenome["network"] => ({
	...base.network,
	hiddenLayers: neurons.map((n) => ({ ...layer, neurons: n as PositiveInt })),
});

describe("topology genes (FEATURE_TOPOLOGY_GENES)", () => {
	const mutate = (topologyGene?: boolean, neurons = [500, 500, 500, 500, 500, 2]) =>
		mutateNetworkStructure({
			genome: {
				...base,
				network: withLayers(neurons),
				gaControl: {
					...base.gaControl,
					...(topologyGene !== undefined && { topologyGene }),
				},
			},
			mutationConfig: base.mutation,
			rng: () => 0.99,
		}).hiddenLayers.map((l) => l.neurons);

	test("flag off or absent: same genome, no bound; on: clamped", () => {
		expect(mutate(false)).toEqual(mutate());
		expect(mutate()).toEqual([500, 500, 500, 500, 500, 2]);
		expect(mutate(true)).toEqual(new Array(4).fill(TOPOLOGY_BOUNDS.maxNeurons));
		expect(mutate(true, [2])).toEqual([TOPOLOGY_BOUNDS.minNeurons]);
	});

	const net = (n: LamarckGenome["network"]) =>
		new NeuralNetwork({ ...policyNetworkConfig(n), rng: () => 0.5 });

	test.each([
		[
			[64, 32],
			[64, 32, 16, 8],
		],
		[[64, 32, 16, 8], [16]],
		[[10], [128, 8]],
	])("parents %j and %j cross into a valid network", (a, b) => {
		for (const r of [0.1, 0.9]) {
			const child = crossoverNetwork({
				left: withLayers(a),
				right: withLayers(b),
				rng: () => r,
			});
			expect(child.hiddenLayers.length).toBeLessThanOrEqual(
				Math.max(a.length, b.length)
			);
			const n = net(child);
			expect(() => n.setWeights(n.getWeights())).not.toThrow();
		}
	});

	test("evolved topology: weights reloaded give the same output", () => {
		const g = withLayers([128, 8]);
		const x = new Float32Array(g.inputDim).fill(0.3);
		const a = net(g);
		const b = new NeuralNetwork({ ...policyNetworkConfig(g), rng: () => 0.1 });
		b.setWeights(a.getWeights());
		expect(Array.from(b.forward(x).output)).toEqual(
			Array.from(a.forward(x).output)
		);
	});
});
