import { describe, expect, it } from "@jest/globals";
import { NumericRange } from "@trading-model/primitives/numeric-range";
import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import {
	adaptGAControl,
	createGAControlGenome,
} from "../../../src/domain/genetic-algorithm/genome-control";
import type { LamarckGenome } from "../../../src/domain/genetic-algorithm/genome-types";
import { RewardShaper } from "../../../src/domain/genetic-algorithm/reward-shaping";
import type { DeepReadonly } from "../../../src/domain/genetic-algorithm/shared-types";
import { NormalizationStats } from "../../../src/domain/normalization-stats";

function genomeWith(
	rewardShaping: Partial<LamarckGenome["rl"]["rewardShaping"]>
): DeepReadonly<LamarckGenome> {
	const base = createDefaultGenome("g0_0");
	return {
		...base,
		rl: {
			...base.rl,
			rewardShaping: {
				...base.rl.rewardShaping,
				clip: false,
				scale: false,
				normalize: false,
				sparse: false,
				...rewardShaping,
			},
		},
	} as DeepReadonly<LamarckGenome>;
}

describe("RewardShaper", () => {
	it("applies the scaleFactor gene before clipping", () => {
		const shaper = new RewardShaper(
			genomeWith({
				scale: true,
				scaleFactor: 0.5 as never,
				clip: true,
				clipBounds: new NumericRange(-1, 1) as never,
			}).rl.rewardShaping
		);

		expect([1, -2, 4, 0.1].map((raw) => shaper.shape(raw))).toEqual([
			0.5,
			-1,
			1,
			expect.closeTo(0.05),
		]);
	});

	it("gives a sparse genome nothing per step and its shaped total at the end", () => {
		const shaper = new RewardShaper(
			genomeWith({ sparse: true }).rl.rewardShaping
		);

		expect([1, -2, 4, 0.5].map((raw) => shaper.shape(raw))).toEqual([
			0, 0, 0, 0,
		]);
		expect(shaper.episodeBonus()).toBe(3.5);
	});

	it("normalises with the running statistics when the gene is on", () => {
		const shaper = new RewardShaper(
			genomeWith({ normalize: true }).rl.rewardShaping,
			new NormalizationStats()
		);

		const shaped = [10, 20, 30].map((raw) => shaper.shape(raw));

		expect(Math.abs(shaped[2])).toBeLessThan(10);
		expect(shaper.episodeBonus()).toBe(0);
	});
});

describe("EpisodeScores.sortino", () => {
	it("falls back to the mean without any loss instead of dividing by ~0", () => {
		expect(new EpisodeScores([1, 2, 3]).sortino()).toBe(2);
	});

	it("takes the downside deviation over every score", () => {
		// downside deviation: sqrt((0 + 4 + 0 + 0) / 4) = 1
		expect(new EpisodeScores([4, -2, 2, 0]).sortino()).toBe(1);
	});
});

describe("adaptive episodes per evaluation", () => {
	it("never adapts below 10 episodes", () => {
		const ctrl = createGAControlGenome();
		expect(ctrl.evaluation.episodesPerIndividual).toBe(10);

		const improving = adaptGAControl(ctrl, [1, 2, 3, 4, 5], 0);
		expect(improving.evaluation.episodesPerIndividual).toBe(10);
	});
});
