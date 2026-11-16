import { describe, expect, it } from "@jest/globals";
import { FeatureVector } from "@trading-model/model-runtime/feature-vector";
import { Cash, Price } from "@trading-model/primitives/primitives";
import { NETWORK_INPUT_LAYOUT } from "../../../src/domain/agent/agent-state";
import {
	barsSinceDecision,
	decisionBars,
} from "../../../src/domain/genetic-algorithm/decision-events";
import { evalPhase } from "../../../src/domain/genetic-algorithm/evaluation-phase";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../src/domain/genetic-algorithm/genome";
import { crossoverDecision } from "../../../src/domain/genetic-algorithm/genome-rl/decision";
import type { RLBackend } from "../../../src/domain/genetic-algorithm/rl-backend";
import type { DeepReadonly } from "../../../src/domain/genetic-algorithm/shared-types";
import { trainPhase } from "../../../src/domain/genetic-algorithm/training-phase";

/** `length` flat bars; the bars in `spikes` carry a volume of 9 deviations. */
const market = (length: number, spikes: number[] = [], jumpAt?: number) =>
	Array.from({ length }, (_unused, index) => {
		const features = FeatureVector.fromFloat32Array(new Float32Array([0]));
		features.candle.volumeRatio = (spikes.includes(index) ? 9 : 0) as never;
		const price = jumpAt !== undefined && index >= jumpAt ? 120 : 100;
		return { features, price: Price.of(price) };
	});

const horizonOf = (minGap: number) => {
	const base = createDefaultGenome("g0_0", undefined, true).rl.horizon;
	return { ...base, decision: { ...base.decision, minGap } } as never;
};

const genomeOf = (minGap: number, gamma = 0.5) => {
	const base = createDefaultGenome("g0_0", undefined, true);
	return {
		...base,
		rl: { ...base.rl, gamma, horizon: horizonOf(minGap) },
	} as unknown as DeepReadonly<LamarckGenome>;
};

const idleBackend = (
	step: RLBackend["step"],
	remember: RLBackend["remember"] = () => undefined
): RLBackend => ({
	forwardPass: () => new Float32Array(3),
	step,
	remember,
	replay: () => undefined,
	getWeights: () => new Float32Array(0),
	setWeights: () => undefined,
	getPnL: () => Cash.of(0),
	resetEpisode: () => undefined,
});

describe("event-driven decisions", () => {
	it("flag off: no decision gene and the base input width", () => {
		const genome = createDefaultGenome("g0_0");
		expect(genome.rl.horizon).not.toHaveProperty("decision");
		expect(genome.network.inputDim).toBe(NETWORK_INPUT_LAYOUT.dim);
		expect(createDefaultGenome("g0_0", undefined, true).network.inputDim).toBe(
			NETWORK_INPUT_LAYOUT.dim + 1
		);
	});

	it("a detector reads closed bars only: later bars do not change it", () => {
		const full = decisionBars(market(30, [4, 20], 12), horizonOf(1));
		const cut = decisionBars(market(10, [4]), horizonOf(1));
		expect(cut).toEqual([4]);
		expect(full.slice(0, 1)).toEqual(cut);
		// the 20 % jump at bar 12 fires on its own bar, not before
		expect(full).toContain(12);
		expect(full).not.toContain(11);
	});

	it("minGap holds over a burst of events", () => {
		const burst = market(30, [3, 4, 5, 6, 7, 20]);
		expect(decisionBars(burst, horizonOf(1))).toEqual([3, 4, 5, 6, 7, 20]);
		expect(decisionBars(burst, horizonOf(4))).toEqual([3, 7, 20]);
	});

	it("crossover keeps the decision genes inside their bounds", () => {
		const { decision } = horizonOf(1) as never as {
			decision: Parameters<typeof crossoverDecision>[0];
		};
		const out = crossoverDecision(decision, decision, () => 1e9);
		expect(out.minGap).toBe(50);
		expect(out.priceMove).toBe(0.05);
	});

	it("a session without any event does not crash and never trades", () => {
		const backend = idleBackend(() => {
			throw new Error("must not decide");
		});
		const out = evalPhase({
			genome: genomeOf(3),
			validationData: market(30),
			backendFactory: () => backend,
		});
		expect(out.decisions).toBe(0);
		expect(out.episodePnl.every((pnl) => pnl === 0)).toBe(true);
	});

	it("discounts by the bars elapsed between decisions", () => {
		const stored: { discount?: number }[] = [];
		const seen: (number | undefined)[] = [];
		const backend = idleBackend(
			(_input, barsSince) => {
				seen.push(barsSince);
				return { reward: 0, action: 0, state: new Float32Array(1) };
			},
			(transition) => stored.push(transition)
		);
		trainPhase({
			backend,
			trainData: market(30, [3, 5, 20]),
			genome: genomeOf(1, 0.5),
		});
		expect(barsSinceDecision([3, 5, 20], 2)).toBe(15);
		expect(seen).toEqual([50, 2, 15]);
		// transitions are held one behind: the one from bar 3 to bar 5 is stored
		// when the one from 5 to 20 arrives, and the last is stored at close.
		expect(stored.map((t) => t.discount)).toEqual([0.5 ** 2, 0.5 ** 15]);
	});
});
