import { describe, expect, test } from "@jest/globals";
import type {
	Percentage,
	PositiveInt,
} from "@trading-model/primitives/primitives";
import { crossoverMutation } from "../../../../src/domain/genetic-algorithm/crossover/crossover-mutation";
import { crossoverGenomes } from "../../../../src/domain/genetic-algorithm/crossover/genome-crossover";
import { createDefaultGenome } from "../../../../src/domain/genetic-algorithm/factory";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
} from "../../../../src/domain/genetic-algorithm/genome";
import { crossoverNetwork } from "../../../../src/domain/genetic-algorithm/genome-network/crossover";
import { crossoverRL } from "../../../../src/domain/genetic-algorithm/genome-rl/crossover";

const alternating = (...values: number[]) => {
	let i = 0;
	return () => values[i++ % values.length];
};

/** Parent B differs from A on every gene the sub-operators combine. */
function distinctParents() {
	const parentA = createDefaultGenome("a");
	const parentB = createDefaultGenome("b");
	parentB.rl.gamma = 0.5 as typeof parentB.rl.gamma;
	parentB.rl.learningRate = 0.5 as typeof parentB.rl.learningRate;
	parentB.mutation.rates.rate = 0.77 as Percentage;
	parentB.mutation.rates.sigma = 0.66 as Percentage;
	parentB.mutation.structural.addNeuronRate = 0.55 as Percentage;
	parentB.mutation.structural.removeNeuronRate = 0.44 as Percentage;
	parentB.mutation.structural.addLayerRate = 0.33 as Percentage;
	parentB.mutation.structural.removeLayerRate =
		0.22 as typeof parentB.mutation.structural.removeLayerRate;
	parentB.network.hiddenLayers[0] = {
		neurons: 7 as PositiveInt,
		activation: ActivationType.Tanh,
		connectionType: ConnectionType.DenseSkip,
		biasType: InitialisationType.Zeros,
	};
	parentA.network.hiddenLayers[0] = {
		neurons: 9 as PositiveInt,
		activation: ActivationType.Relu,
		connectionType: ConnectionType.FullyConnected,
		biasType: InitialisationType.He,
	};
	return { parentA, parentB };
}

describe("Crossover - crossoverGenomes", () => {
	const rng = () => 0.5;

	test("rng below 0.5 copies every gene of A, rng at 0.5 takes every gene of B", () => {
		const { parentA, parentB } = distinctParents();
		const fromA = crossoverGenomes(parentA, parentB, () => 0.2);
		expect(fromA.rl).toEqual(parentA.rl);
		expect(fromA.mutation).toEqual(parentA.mutation);
		expect(fromA.network.hiddenLayers[0]).toEqual(
			parentA.network.hiddenLayers[0]
		);
		const fromB = crossoverGenomes(parentA, parentB, () => 0.5);
		expect(fromB.rl).toEqual(parentB.rl);
		expect(fromB.mutation).toEqual(parentB.mutation);
		expect(fromB.network.hiddenLayers[0]).toEqual(
			parentB.network.hiddenLayers[0]
		);
		expect(fromB.id).toBe("a");
	});

	test("crossoverNetwork takes each layer gene from the parent the draw picks", () => {
		const { parentA, parentB } = distinctParents();
		const child = crossoverNetwork({
			left: parentA.network,
			right: parentB.network,
			rng: alternating(0.1, 0.9),
		});
		expect(child.hiddenLayers[0]).toEqual({
			neurons: 9,
			activation: ActivationType.Tanh,
			connectionType: ConnectionType.FullyConnected,
			biasType: InitialisationType.Zeros,
		});
	});

	test("crossoverRL takes gamma from A and learningRate from B", () => {
		const { parentA, parentB } = distinctParents();
		const child = crossoverRL({
			left: parentA.rl,
			right: parentB.rl,
			rng: alternating(0.1, 0.9),
		});
		expect(child.gamma).toBe(parentA.rl.gamma);
		expect(child.learningRate).toBe(0.5);
	});

	test("crossoverMutation alternates the origin of each gene in field order", () => {
		const { parentA, parentB } = distinctParents();
		const child = crossoverMutation(
			parentA.mutation,
			parentB.mutation,
			alternating(0.1, 0.9)
		);
		expect(child).toEqual({
			rates: { rate: parentA.mutation.rates.rate, sigma: 0.66 },
			structural: {
				addNeuronRate: parentA.mutation.structural.addNeuronRate,
				removeNeuronRate: 0.44,
				addLayerRate: parentA.mutation.structural.addLayerRate,
				removeLayerRate: 0.22,
			},
		});
	});

	test("should produce offspring from two parents", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		const offspring = crossoverGenomes(parentA, parentB, rng);
		expect(offspring.id).toBe("a");
		expect(offspring.generation).toBe(parentA.generation);
	});

	test("should skip crossover when rng > probability", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		const offspring = crossoverGenomes(parentA, parentB, () => 0.8);
		expect(offspring.id).toBe("a");
		expect(JSON.stringify(offspring)).toBe(JSON.stringify(parentA));
	});

	test("should not mutate parents", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		const aClone = JSON.stringify(parentA);
		crossoverGenomes(parentA, parentB, rng);
		expect(JSON.stringify(parentA)).toBe(aClone);
	});

	test("should handle identical parents", () => {
		const parent = createDefaultGenome("p");
		const offspring = crossoverGenomes(parent, parent, rng);
		expect(offspring.id).toBe("p");
		expect(offspring.network).toEqual(parent.network);
	});

	test("offspring should have valid network structure", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		const offspring = crossoverGenomes(parentA, parentB, rng);
		expect(offspring.network.hiddenLayers.length).toBeGreaterThan(0);
		expect(offspring.rl).toEqual(parentB.rl);
		expect(offspring.mutation).toEqual(parentB.mutation);
	});

	test("should handle parents with different hidden layer counts", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentB.network.hiddenLayers = [
			{
				neurons: 128 as PositiveInt,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
		const offspring = crossoverGenomes(parentA, parentB, () => 0.2);
		expect(offspring.network.hiddenLayers.length).toBe(2);
	});

	test("should skip extra layer when rng >= 0.5 in crossoverNetwork", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentB.network.hiddenLayers = [
			{
				neurons: 128 as PositiveInt,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
		const offspring = crossoverGenomes(parentA, parentB, () => 0.6);
		expect(offspring.network.hiddenLayers.length).toBe(1);
	});

	test("should use longer parent when a has fewer layers than b", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentA.network.hiddenLayers = [
			{
				neurons: 32 as PositiveInt,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
		const offspring = crossoverGenomes(parentA, parentB, () => 0.3);
		expect(offspring.network.hiddenLayers.length).toBeGreaterThanOrEqual(1);
	});

	test("should push extra layer when rng < 0.5 in crossoverNetwork", () => {
		const parentA = createDefaultGenome("a");
		const parentB = createDefaultGenome("b");
		parentB.network.hiddenLayers = [
			{
				neurons: 128 as PositiveInt,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
		const offspring = crossoverGenomes(parentA, parentB, () => 0.3);
		expect(offspring.network.hiddenLayers.length).toBe(2);
	});
});
