import { describe, expect, it, jest } from "@jest/globals";
import type { Reward } from "@trading-model/primitives/primitives";
import type { NeuralNetwork } from "../../../src/domain/neural-network/neural-network";
import { computeReplayTarget } from "../../../src/domain/neural-network/q-value-computer";
import {
	ExperienceKind,
	type QLearningExperience,
} from "../../../src/domain/neural-network/type";

const NEXT_Q = [1, 3, 2];

function makeNetwork(nextQ: number[] = NEXT_Q): NeuralNetwork {
	return {
		forward: jest.fn((..._args: any[]) => ({
			output: new Float32Array(nextQ),
		})),
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

// The mock returns NEXT_Q for every state: Q(s) = Q(s') = [1, 3, 2].
describe("computeReplayTarget", () => {
	it("should move the played action by the weighted TD error", () => {
		const { target, tdError } = computeReplayTarget(
			makeNetwork(),
			makeExperience({ action: 2 }),
			0.9,
			0.5
		);

		expect(tdError).toBeCloseTo(1 + 0.9 * 3 - 2, 5);
		expect([...target]).toEqual([...new Float32Array([1, 3, 2 + 0.5 * 1.7])]);
	});

	it("should drop the bootstrap term on a terminal transition", () => {
		const { tdError } = computeReplayTarget(
			makeNetwork(),
			makeExperience({ done: true, reward: -2.5 as unknown as Reward }),
			0.9
		);

		expect(tdError).toBe(-2.5 - 1);
	});

	it.each([-1, 3, 1.5])(
		"should reject the out-of-range action %p",
		(action) => {
			expect(() =>
				computeReplayTarget(makeNetwork(), makeExperience({ action }), 0.9)
			).toThrow(/action/);
		}
	);
});
