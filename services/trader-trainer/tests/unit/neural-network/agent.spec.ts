import { beforeEach, describe, expect, it } from "@jest/globals";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { Agent } from "../../../src/domain/neural-network/agent";
import type { NetworkArchitecture } from "../../../src/domain/neural-network/type";
import {
	ActivationType,
	ConnectionType,
	NormalisationType,
} from "../../../src/domain/neural-network/type";

function makeConfig(
	overrides?: Partial<NetworkArchitecture>
): NetworkArchitecture {
	return {
		neuronsByLayer: [4 as PositiveInt, 6 as PositiveInt, 3 as PositiveInt],
		activationType: [ActivationType.Relu, ActivationType.Sigmoid],
		normalisationType: NormalisationType.None,
		connectionType: ConnectionType.FullyConnected,
		enablePool: true,
		poolMaxSize: 100 as PositiveInt,
		...overrides,
	};
}

describe("Agent", () => {
	describe("forward", () => {
		let agent: Agent;

		beforeEach(() => {
			agent = new Agent(makeConfig());
		});

		it("should delegate to neural network and return output", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const result = agent.nn.forward(input);
			expect(result).toHaveProperty("output");
			expect(result.output).toBeInstanceOf(Float32Array);
			expect(result.output.length).toBe(3);
		});
	});

	describe("constructor", () => {
		it("should create an Agent with valid config", () => {
			const agent = new Agent(makeConfig());

			expect(agent.nn.parameterCount()).toBeGreaterThan(0);
		});

		it("should throw when neuronsByLayer has fewer than 2 entries", () => {
			expect(
				() => new Agent(makeConfig({ neuronsByLayer: [3 as PositiveInt] }))
			).toThrow();
		});

		it("should create neural network inside agent", () => {
			const agent = new Agent(makeConfig());

			expect(agent.nn.parameterCount()).toBeGreaterThan(0);
		});
	});
});
