import { describe, expect, it } from "@jest/globals";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import { AGENT_STATE_DIM } from "../src/agent/agent-state";
import { playEpisode } from "../src/agent/decision-events";
import { FEATURE_DIM } from "../src/feature-vector-codec";
import { ActivationType, NormalisationType } from "../src/neural-network/type";
import {
	decideOnLastBar,
	type PolicyGenome,
	policyAgentConfig,
	replayModel,
} from "../src/replay";

const T0 = 1_700_000_000_000;
const candles = Array.from({ length: 560 }, (_, idx) => {
	const price = 100 + 8 * Math.sin(idx / 5) + idx / 20;
	return {
		timestamp: T0 + idx * 60_000,
		closeTimestamp: T0 + idx * 60_000 + 59_999,
		open: price - 0.3,
		high: price + 1,
		low: price - 1,
		close: price,
		volume: 1000 + 300 * Math.cos(idx),
	} as unknown as CandleData;
});
const SIMULATOR = {
	initialCash: 1000,
	feeRate: 0.001,
	executionCostRate: 0.0005,
	tradeFraction: 0.1,
	observePosition: true,
};

function genome(variant: "every-bar" | "on-event"): {
	genome: PolicyGenome;
	weights: Float32Array;
} {
	const event = variant === "on-event";
	const inputDim = FEATURE_DIM + AGENT_STATE_DIM + (event ? 1 : 0);
	const outputDim = event ? 5 : 3;
	const hidden = 4;
	return {
		genome: {
			network: {
				inputDim,
				outputDim,
				hiddenLayers: [{ neurons: hidden, activation: ActivationType.Tanh }],
				normalization: NormalisationType.None,
				...(event && {
					actionSet: "sized_50_100" as const,
					inputMask: [true, false],
				}),
			},
			rl: {
				horizon: event
					? {
							frameSkip: 1,
							decision: {
								mode: "on_event",
								priceMove: 0.01,
								volumeMultiple: 1,
								minGap: 2,
							},
						}
					: { frameSkip: 3 },
			},
		},
		// Weights the greedy policy trades with on these candles.
		weights: new Float32Array(
			inputDim * hidden + hidden + hidden * outputDim + outputDim
		).map((_, idx) => (event ? Math.cos(idx * 0.9) * 2 : Math.sin(idx * 1.7))),
	};
}

describe("replayModel (ADR-0079 §3)", () => {
	it.each(["every-bar", "on-event"] as const)(
		"plays the test steps greedily and gives the admission ratios (%s)",
		(variant) => {
			const { genome: g, weights } = genome(variant);
			const replay = () =>
				replayModel({
					genome: g,
					weights,
					testFrom: candles[80].timestamp,
					simulator: SIMULATOR,
					candles,
				});

			const ratios = replay();
			expect(ratios.sharpe).not.toBe(0);
			expect(Number.isFinite(ratios.calmar)).toBe(true);
			expect(replay()).toEqual(ratios);
		}
	);

	it("replays at the manifest exposure cap, default 0.3 when absent", () => {
		const { network } = genome("every-bar").genome;
		const cap = (maxExposureFraction?: number) =>
			policyAgentConfig(network, { ...SIMULATOR, maxExposureFraction }).wallet
				.maxExposureFraction;
		expect(cap(1)).toBe(1);
		expect(cap()).toBe(0.3);
	});

	it("drops inconsistent candles and those before the last gap, as the trainer does", () => {
		const { genome: g, weights } = genome("every-bar");
		const replay = (bars: CandleData[]) =>
			replayModel({
				genome: g,
				weights,
				testFrom: candles[80].timestamp,
				simulator: SIMULATOR,
				candles: bars,
			});
		const early = {
			...candles[0],
			timestamp: T0 - 600_000,
			close: 1,
			volume: 1e6,
		} as unknown as CandleData;
		const broken = {
			...candles[50],
			timestamp: candles[50].timestamp + 1,
			close: 1e4,
			volume: 1e6,
		} as unknown as CandleData;
		expect(
			replay([early, ...candles.slice(0, 51), broken, ...candles.slice(51)])
		).toEqual(replay(candles));
	});
});

describe("decideOnLastBar (ADR-0087)", () => {
	it.each(["every-bar", "on-event"] as const)(
		"decides on the last bar of the window, the same way twice (%s)",
		(variant) => {
			const { genome: g, weights } = genome(variant);
			const decide = (length: number) =>
				decideOnLastBar({
					genome: g,
					weights,
					simulator: SIMULATOR,
					candles: candles.slice(0, length),
				});
			const answers = Array.from({ length: 60 }, (_, idx) => decide(61 + idx));
			for (const [idx, answer] of answers.entries()) {
				expect(answer?.barTimestamp).toBe(candles[60 + idx].timestamp);
			}
			expect(answers.map((answer) => answer?.order)).toEqual(
				Array.from({ length: 60 }, (_, idx) => decide(61 + idx)?.order)
			);
			const orders = answers.flatMap((answer) => answer?.order ?? []);
			// The every-bar weights only hold on these last bars.
			expect(orders.length > 0).toBe(variant === "on-event");
			expect(orders.every((order) => order.quantity > 0)).toBe(true);
		}
	);

	it.each([
		[2, 500],
		[2, 501],
		[3, 500],
		[3, 501],
	])(
		"decides every frameSkip %i bars in absolute time over a sliding window of %i candles",
		(frameSkip, size) => {
			const { genome: base, weights: every } = genome("every-bar");
			const g: PolicyGenome = { ...base, rl: { horizon: { frameSkip } } };
			// Weights that trade on these last bars.
			const weights = every.map((_, idx) => Math.sin(idx * 1.1) * 5);
			// The window slides one bar at a time over the last 40 candles.
			const ends = Array.from({ length: 40 }, (_, idx) => candles.length - idx);
			const orders = ends.filter(
				(end) =>
					decideOnLastBar({
						genome: g,
						weights,
						simulator: SIMULATOR,
						candles: candles.slice(end - size, end),
					})?.order
			);
			expect(orders.length).toBeGreaterThan(0);
			for (const end of orders) {
				expect(
					Math.round(candles[end - 1].timestamp / 60_000) % frameSkip
				).toBe(0);
			}
		}
	);

	it("has no decision for a window without a step", () => {
		const { genome: g, weights } = genome("every-bar");
		expect(
			decideOnLastBar({
				genome: g,
				weights,
				simulator: SIMULATOR,
				candles: candles.slice(0, 1),
			})
		).toBeUndefined();
	});
});

describe("playEpisode last bar", () => {
	it("marks a buy to the final close when the last bar is no decision", () => {
		const steps = [100, 100, 90].map((price) => ({ price }) as never);
		const curve: number[] = [];
		let mark = 100;
		const { pnl } = playEpisode(
			steps,
			{ frameSkip: 3 },
			{
				step: () => undefined,
				pnl: (last?: { price: number }) => {
					mark = last?.price ?? mark;
					return mark - 100;
				},
			},
			curve
		);
		expect(pnl).toBe(-10);
		expect(curve[2]).toBe(-10);
	});
});
