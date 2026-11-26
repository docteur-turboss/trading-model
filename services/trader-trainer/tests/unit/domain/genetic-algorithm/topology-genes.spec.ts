import { describe, expect, test } from "@jest/globals";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { createDefaultGenome } from "../../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../../src/domain/genetic-algorithm/genome";
import { crossoverNetwork } from "../../../../src/domain/genetic-algorithm/genome-network/crossover";
import {
	mutateNetworkStructure,
	TOPOLOGY_BOUNDS,
} from "../../../../src/domain/genetic-algorithm/genome-network/mutation";

const base = createDefaultGenome("t") as LamarckGenome;
const layer = base.network.hiddenLayers[0];
const withLayers = (neurons: number[]): LamarckGenome["network"] => ({
	...base.network,
	hiddenLayers: neurons.map((n) => ({ ...layer, neurons: n as PositiveInt })),
});

describe("topology genes (FEATURE_TOPOLOGY_GENES)", () => {
	const mutate = (topologyGene?: boolean) =>
		mutateNetworkStructure({
			genome: {
				...base,
				network: withLayers([500, 500, 500, 500, 500, 2]),
				gaControl: { ...base.gaControl, topologyGene },
			},
			mutationConfig: base.mutation,
			rng: () => 0.99,
		}).hiddenLayers.map((l) => l.neurons);

	test("flag off: no bound; flag on: depth and width clamped", () => {
		expect(mutate(false)).toEqual([500, 500, 500, 500, 500, 2]);
		expect(mutate(true)).toEqual([
			TOPOLOGY_BOUNDS.maxNeurons,
			TOPOLOGY_BOUNDS.maxNeurons,
			TOPOLOGY_BOUNDS.maxNeurons,
			TOPOLOGY_BOUNDS.maxNeurons,
		]);
		expect(
			mutateNetworkStructure({
				genome: {
					...base,
					network: withLayers([2]),
					gaControl: { ...base.gaControl, topologyGene: true },
				},
				mutationConfig: base.mutation,
				rng: () => 0.99,
			}).hiddenLayers[0].neurons
		).toBe(TOPOLOGY_BOUNDS.minNeurons);
	});

	test.each([
		[
			[64, 32],
			[64, 32, 16, 8],
		],
		[[64, 32, 16, 8], [16]],
		[[10], [128, 8]],
	])("parents of depth %j and %j cross into a valid network", (a, b) => {
		for (const r of [0.1, 0.9]) {
			const child = crossoverNetwork({
				left: withLayers(a),
				right: withLayers(b),
				rng: () => r,
			});
			const depth = child.hiddenLayers.length;
			expect(depth).toBeLessThanOrEqual(Math.max(a.length, b.length));
			for (const l of child.hiddenLayers) {
				expect(l.neurons).toBeGreaterThanOrEqual(1);
			}
		}
	});
});
