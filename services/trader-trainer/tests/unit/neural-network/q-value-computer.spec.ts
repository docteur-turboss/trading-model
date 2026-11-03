import { describe, expect, it, jest } from "@jest/globals";
import type { Reward } from "@trading-model/primitives/primitives";
import type { NeuralNetwork } from "../../../src/domain/neural-network/neural-network";
import { computeQLearningTarget } from "../../../src/domain/neural-network/q-value-computer";
import {
	ExperienceKind,
	type QLearningExperience,
} from "../../../src/domain/neural-network/type";

const NEXT_Q = [1, 3, 2];

function makeNetwork(nextQ: number[] = NEXT_Q): NeuralNetwork {
	return {
		forward: jest.fn(() => ({ output: new Float32Array(nextQ) })),
	} as unknown as NeuralNetwork;
}

function makeExperience(
	overrides: Partial<QLearningExperience> = {}
): QLearningExperience {
	return {
		kind: ExperienceKind.QLearning,
		input: new Float32Array([0.1, 0.2]),
		output: new Float32Array([0.5, 0.2, 0.1]),
		reward: 1 as unknown as Reward,
		nextState: new Float32Array([0.3, 0.4]),
		done: false,
		action: 0,
		...overrides,
	};
}

describe("computeQLearningTarget", () => {
	it("should set r + γ·max Q(s') on the played action", () => {
		const target = computeQLearningTarget(makeNetwork(), makeExperience(), 0.9);

		expect(target[0]).toBeCloseTo(1 + 0.9 * 3, 5);
		expect(target[1]).toBeCloseTo(0.2, 5);
		expect(target[2]).toBeCloseTo(0.1, 5);
	});

	it("should evaluate max Q on the next state", () => {
		const nn = makeNetwork();
		const exp = makeExperience();

		computeQLearningTarget(nn, exp, 0.9);

		expect(nn.forward).toHaveBeenCalledWith(exp.nextState);
	});

	it("should drop the bootstrap term on a terminal transition", () => {
		const target = computeQLearningTarget(
			makeNetwork(),
			makeExperience({ done: true, reward: -2.5 as unknown as Reward }),
			0.9
		);

		expect(target[0]).toBe(-2.5);
	});

	it("should reduce to the immediate reward when γ is 0", () => {
		const target = computeQLearningTarget(makeNetwork(), makeExperience(), 0);

		expect(target[0]).toBe(1);
	});

	it("should update the played action even when it is not the greedy one", () => {
		// Exploration picked action 2 although Q(s) is highest on action 0.
		const target = computeQLearningTarget(
			makeNetwork(),
			makeExperience({ action: 2 }),
			0.9
		);

		expect(target[0]).toBeCloseTo(0.5, 5);
		expect(target[1]).toBeCloseTo(0.2, 5);
		expect(target[2]).toBeCloseTo(3.7, 5);
	});

	it("should not mutate the recorded Q-values", () => {
		const exp = makeExperience();

		computeQLearningTarget(makeNetwork(), exp, 0.9);

		expect([...exp.output]).toEqual([...new Float32Array([0.5, 0.2, 0.1])]);
	});

	it.each([
		-1, 3, 1.5,
	])("should reject the out-of-range action %p", (action) => {
		expect(() =>
			computeQLearningTarget(makeNetwork(), makeExperience({ action }), 0.9)
		).toThrow(/action/);
	});
});
