import { describe, expect, it, jest } from "@jest/globals";
import { Price } from "@trading-model/primitives/primitives";
import { FeatureVector } from "../../../src/domain/feature-vector";
import type { RLBackend } from "../../../src/domain/genetic-algorithm/rl-backend";
import { trainPhase } from "../../../src/domain/genetic-algorithm/training-phase";
import {
	type Experience,
	ExperienceKind,
} from "../../../src/domain/neural-network/type";
import { makeMinimalBestGenome } from "../../fixtures/genome.fixture";

function makeBare(value: number, action?: number): Experience {
	return {
		kind: ExperienceKind.Bare,
		input: new Float32Array([value]),
		output: new Float32Array([value, value, value]),
		action,
	};
}

function makeBackend(pool: Experience[]): RLBackend {
	return {
		step: jest.fn(() => ({ reward: 0 })),
		train: jest.fn(),
		getExperiencePool: jest.fn(() => pool),
	} as unknown as RLBackend;
}

const trainData = [0.1, 0.2].map((value) => ({
	features: FeatureVector.fromFloat32Array(new Float32Array([value])),
	price: Price.of(100),
}));

describe("trainPhase", () => {
	const genome = makeMinimalBestGenome();
	const rewardBuf = new Float32Array([0.5, -0.25]);

	it("should train on the previous transition with the action it played", () => {
		const prev = makeBare(1, 2);
		const backend = makeBackend([prev, makeBare(2, 0)]);

		trainPhase({ backend, trainData, rewardBuf, genome });

		expect(backend.train).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: ExperienceKind.QLearning,
				input: prev.input,
				action: 2,
			}),
			genome.rl.gamma
		);
	});

	it("should refuse a transition whose action was never recorded", () => {
		const backend = makeBackend([makeBare(1), makeBare(2)]);

		expect(() => trainPhase({ backend, trainData, rewardBuf, genome })).toThrow(
			/played action/
		);
	});
});
