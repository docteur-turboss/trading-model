import { describe, expect, it } from "@jest/globals";
import { runWithCorrelationId } from "@trading-model/http/correlation-id";
import { EpisodeScores } from "@trading-model/model-runtime/episode-scores";
import { FEATURE_LAYOUT } from "@trading-model/model-runtime/feature-vector-codec";
import { replayModel } from "@trading-model/model-runtime/replay";
import {
	barsPerYear,
	segmentRatios,
} from "@trading-model/model-runtime/replay-metrics";
import type {
	Fitness,
	PositiveInt,
	Ratio,
} from "@trading-model/primitives/primitives";
import {
	CorrelationId,
	DurationMs,
	Price,
} from "@trading-model/primitives/primitives";
import { ModelPublisher } from "../../../../src/adapters/outbound/model-publisher";
import { NETWORK_INPUT_LAYOUT } from "../../../../src/domain/agent/agent-state";
import { evalPhase } from "../../../../src/domain/genetic-algorithm/evaluation-phase";
import { createDefaultGenome } from "../../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../../src/domain/genetic-algorithm/genome";
import {
	makeTradingAgentBackend,
	SIMULATOR_PARAMS,
} from "../../../../src/domain/genetic-algorithm/rl-backend";
import type { DeepReadonly } from "../../../../src/domain/genetic-algorithm/shared-types";
import { buildSummary } from "../../../../src/domain/genome-summary-builder";
import { MarketDataBuffer } from "../../../../src/domain/market-data-buffer";
import {
	assessAdmission,
	MIN_ADMISSION_TEST_BARS,
} from "../../../../src/domain/model-admission";
import { buildModelManifest } from "../../../../src/domain/model-artifact";
import { makeCandle } from "../../../fixtures/market-data.fixture";

/** cumulative PnL: 3, -2, 0, -4, 6 -> drawdown 7 (peak 3, trough -4). */
const EPISODES = [3, -5, 2, -4, 10];

function summaryOf(scores?: number[]) {
	const genome = createDefaultGenome(
		"g-1",
		4 as PositiveInt
	) as DeepReadonly<LamarckGenome>;
	return buildSummary(
		genome,
		1.5 as never,
		scores && {
			episodesRun: scores.length as PositiveInt,
			computeMs: DurationMs.of(1000),
			efficiencyScore: 1 as Ratio,
			variance: 0,
			rawScores: new EpisodeScores(scores),
		}
	);
}

const STORED = {
	version: "20261029T101530Z-0123456789ab",
	sha256: "ab".repeat(32),
	admissible: false,
};

async function publishedMessage(scores?: number[], version = STORED.version) {
	const posted: { payload: Record<string, unknown>; metadata: any }[] = [];
	const publisher = new ModelPublisher(
		{
			post: {
				indirect: (payload: Record<string, unknown>, metadata: unknown) => {
					posted.push({ payload, metadata });
					return Promise.resolve();
				},
			},
		} as never,
		{ trainerId: "trader-trainer", instanceId: "trader-trainer-1" }
	);
	await publisher.publish("BTCUSDT" as never, summaryOf(scores), {
		...STORED,
		version,
	});
	return posted[0];
}

async function publishedPayload(scores?: number[]) {
	return (await publishedMessage(scores)).payload;
}

describe("input layout of a trained model", () => {
	it("names every network input, market features then agent state", () => {
		expect(FEATURE_LAYOUT.fields).toHaveLength(FEATURE_LAYOUT.dim);
		expect(NETWORK_INPUT_LAYOUT.fields).toHaveLength(NETWORK_INPUT_LAYOUT.dim);
		// The manifest lists the inputs: no order book, trade or ticker input exists (ADR-0083).
		expect(FEATURE_LAYOUT.fields.join()).not.toMatch(/book|trade|ticker/i);
		expect(NETWORK_INPUT_LAYOUT.fields.at(-1)).toBe("AgentExposure");
		expect(createDefaultGenome("g", 0 as never).network.inputDim).toBe(
			NETWORK_INPUT_LAYOUT.dim
		);
	});
});

describe("metrics of a trained model", () => {
	it("the summary carries the drawdown of the evaluation episodes", () => {
		const summary = summaryOf(EPISODES);

		expect(summary.maxDrawdown).toBe(7);
		expect(summary.avgPnl).toBe(1.2);
		expect(summary).not.toHaveProperty("complexityPenalty");
		expect(summary).not.toHaveProperty("negFlops");
	});

	it("training.model.published carries the drawdown of the episodes, not a constant", async () => {
		const payload = await publishedPayload(EPISODES);

		expect(payload.maxDrawdown).toBe(new EpisodeScores(EPISODES).maxDrawdown());
		expect(payload.maxDrawdown).toBe(7);
		expect((await publishedPayload([1, 2, 3])).maxDrawdown).toBe(0);
	});

	it("training.model.published is refused when no group exists, so the trainer retries it", async () => {
		expect((await publishedMessage()).metadata.delivery.requireSubscriber).toBe(
			true
		);
	});

	it("an agent without evaluation episodes publishes no drawdown", async () => {
		expect((await publishedPayload()).maxDrawdown).toBe(0);
	});

	it("annualises the Sharpe of the bar curve with the bars per year", () => {
		const genome = createDefaultGenome(
			"g-1",
			4 as PositiveInt
		) as DeepReadonly<LamarckGenome>;
		const curve = new EpisodeScores([1, -0.5, 2, 0.5, -1]);
		const meta = {
			episodesRun: 1,
			computeMs: DurationMs.of(1),
			efficiencyScore: 1 as Ratio,
			variance: 0,
			rawScores: new EpisodeScores([2]),
			pnlCurve: curve,
		};

		const perBar = buildSummary(genome, 1 as never, meta as never);
		const hourly = buildSummary(
			genome,
			1 as never,
			{
				...meta,
				barsPerYear: 8766,
			} as never
		);

		expect(perBar.sharpe).toBeCloseTo(curve.sharpe());
		expect(hourly.sharpe).toBeCloseTo(curve.sharpe() * Math.sqrt(8766));
	});

	it("the manifest metrics are the measured ones", () => {
		const manifest = buildModelManifest(
			{
				symbol: "BTCUSDT",
				instanceId: "trader-trainer-1",
				bestGenome: createDefaultGenome("g-1", 4 as PositiveInt) as never,
				weights: new Float32Array([1]),
				features: { dim: 1, fields: ["close"] },
				normalization: {},
				summary: summaryOf(EPISODES),
			},
			{ version: "v", createdAt: new Date(0), sha256: "0".repeat(64) }
		);

		expect(manifest.metrics).toEqual({
			metricsVersion: 6,
			generation: 4,
			fitness: 1.5 as Fitness,
			sharpe: expect.any(Number),
			avgPnl: 1.2,
			maxDrawdown: 7,
			evaluatedOn: "validation",
		});
	});
});

describe("training.model.published identity of the artifact", () => {
	it("carries the stored version, sha256 and admission verdict", async () => {
		expect(await publishedPayload()).toMatchObject(STORED);
	});

	it("carries the caller's correlation id, or draws one outside a request", async () => {
		const inRequest = await runWithCorrelationId(
			CorrelationId.of("550e8400-e29b-41d4-a716-446655440000"),
			() => publishedMessage()
		);

		expect(inRequest.metadata.correlationId).toBe(
			"550e8400-e29b-41d4-a716-446655440000"
		);
		expect((await publishedMessage()).metadata.correlationId).not.toBe(
			"550e8400-e29b-41d4-a716-446655440000"
		);
	});
});

describe("admission of a model (ADR-0069)", () => {
	// Per bar: Sharpe 0.335, Sortino 0.8, Calmar 0.4 (mean 0.4, drawdown 1).
	const curve = new EpisodeScores([1, -0.5, 2, 0.5, -1]);
	// Straight line from the first to the last price over `count` bars.
	const bars = (prices: number[], count = MIN_ADMISSION_TEST_BARS) => {
		const [first, last] = [prices[0], prices[prices.length - 1]];
		return Array.from({ length: count }, (_, i) => ({
			price: Price.of(first + ((last - first) * i) / (count - 1)),
			features: [] as never,
		}));
	};
	const testMeta = (barsPerYear: number) =>
		({ evaluatedOn: "test", pnlCurve: curve, barsPerYear }) as never;

	it.each([
		["above every threshold and buy and hold", 100, [5, 4, 3, 2], true],
		["below the Sharpe threshold", 1, [5, 4, 3, 2], false],
		["below buy and hold on the same bars", 100, [1, 2, 3, 4], false],
	])("%s: admissible %s", (_case, perYear, prices, admissible) => {
		const admission = assessAdmission(testMeta(perYear), bars(prices));
		expect(admission?.admissible).toBe(admissible);
		expect(admission?.evaluatedOn).toBe("test");
		expect(admission?.criteria.sharpe).toBeCloseTo(
			curve.sharpe() * Math.sqrt(perYear)
		);
		expect(admission?.criteria.calmar).toBeCloseTo(curve.calmar() * perYear);
		expect(admission?.thresholds).toEqual({
			minSharpe: 1,
			minSortino: 1.5,
			minCalmar: 1,
		});
	});

	it("is never admissible when the model made no decision", () => {
		const meta = { ...(testMeta(100) as object), decisions: 0 } as never;
		expect(assessAdmission(meta, bars([5, 4, 3, 2]))?.admissible).toBe(false);
	});

	it("gives no verdict on validation metrics, which the selection read", () => {
		const meta = { pnlCurve: curve, barsPerYear: 100 } as never;
		expect(assessAdmission(meta, bars([5, 4]))).toBeUndefined();
		expect(
			assessAdmission(
				{ ...(meta as object), evaluatedOn: "validation" } as never,
				bars([5, 4])
			)
		).toBeUndefined();
	});

	it("gives no verdict under the minimum of test bars", () => {
		const prices = [5, 4, 3, 2];
		expect(
			assessAdmission(testMeta(8766), bars(prices, MIN_ADMISSION_TEST_BARS - 1))
		).toBeUndefined();
		expect(assessAdmission(testMeta(100), bars(prices, 75))).toBeUndefined();
		expect(assessAdmission(testMeta(8766), bars(prices))).toBeDefined();
	});

	it("asks 30 days of bars and carries the attempt rank", () => {
		const prices = [5, 4, 3, 2];
		const perYear = 525_600; // one-minute bars
		const thirtyDays = 30 * 1440;
		expect(
			assessAdmission(testMeta(perYear), bars(prices, thirtyDays - 1))
		).toBeUndefined();
		expect(
			assessAdmission(testMeta(perYear), bars(prices, thirtyDays), 2)?.attempt
		).toBe(2);
	});

	it("asks daily bars for a year of them, not 1440", () => {
		const prices = [5, 4, 3, 2];
		expect(assessAdmission(testMeta(252), bars(prices, 251))).toBeUndefined();
		expect(assessAdmission(testMeta(252), bars(prices, 252))).toBeDefined();
	});

	it("the manifest carries the verdict", () => {
		const admission = assessAdmission(testMeta(100), bars([5, 4, 3]));
		const manifest = buildModelManifest(
			{
				symbol: "BTCUSDT",
				instanceId: "trader-trainer-1",
				bestGenome: createDefaultGenome("g-1", 4 as PositiveInt) as never,
				weights: new Float32Array([1]),
				features: { dim: 1, fields: ["close"] },
				normalization: {},
				summary: summaryOf(EPISODES),
				admission,
			},
			{ version: "v", createdAt: new Date(0), sha256: "0".repeat(64) }
		);
		expect(manifest.admission).toEqual(admission);
	});

	it("the manifest carries the replay window and the simulator", () => {
		const window = { from: 0, testFrom: 600, to: 720 };
		const manifest = buildModelManifest(
			{
				symbol: "BTCUSDT",
				instanceId: "trader-trainer-1",
				bestGenome: createDefaultGenome("g-1", 4 as PositiveInt) as never,
				weights: new Float32Array([1]),
				features: { dim: 1, fields: ["close"] },
				normalization: {},
				summary: summaryOf(EPISODES),
				window,
			},
			{ version: "v", createdAt: new Date(0), sha256: "0".repeat(64) }
		);
		expect(manifest.replay).toEqual({
			...window,
			intervalMs: 60_000,
			evalEpsilon: 0.05,
			simulator: SIMULATOR_PARAMS,
		});
	});
});

describe("replay of a published model (ADR-0079 §3)", () => {
	const candles = Array.from({ length: 300 }, (_, idx) => {
		const price = 100 + 10 * Math.sin(idx / 7) + idx / 10;
		return makeCandle({
			symbol: "BTCUSDT" as never,
			timestamp: (1_700_000_000_000 + idx * 60_000) as never,
			closeTimestamp: (1_700_000_000_000 + idx * 60_000 + 59_999) as never,
			open: Price.of(price - 0.5),
			high: Price.of(price + 1),
			low: Price.of(price - 1),
			close: Price.of(price),
			volume: (1000 + 50 * Math.cos(idx)) as never,
		});
	});

	it.each([false, true])(
		"gives the ratios of the trainer's code at epsilon 0 on the same bars (event-driven %s)",
		(eventDriven) => {
			const buffer = new MarketDataBuffer();
			for (const candle of candles) {
				buffer.addCandle("BTCUSDT" as never, candle);
			}
			const test = buffer.getAllWindows("BTCUSDT" as never)![0].test!;
			const genome = createDefaultGenome("g-1", 1 as PositiveInt, eventDriven);
			// Weights the greedy policy trades with on these bars.
			const weights = makeTradingAgentBackend(genome as never)
				.getWeights()
				.map((_, idx) => Math.sin(idx) * 2);
			const greedy = (g: any) =>
				makeTradingAgentBackend({
					...g,
					rl: {
						...g.rl,
						discretePolicy: { epsilonStart: 0, epsilonMin: 0, epsilonDecay: 1 },
					},
				});
			const trainer = evalPhase({
				genome: {
					...genome,
					trainedWeights: weights,
					gaControl: {
						...genome.gaControl,
						evaluation: {
							...genome.gaControl.evaluation,
							episodesPerIndividual: 1,
						},
					},
				} as never,
				validationData: test,
				backendFactory: greedy,
			});

			const replayed = replayModel({
				genome: JSON.parse(JSON.stringify(genome)),
				weights,
				testFrom: test[0].timestamp!,
				simulator: SIMULATOR_PARAMS,
				candles,
			});

			expect(replayed.sharpe).not.toBe(0);
			expect(replayed).toMatchObject(
				segmentRatios(
					new EpisodeScores(trainer.pnlCurve),
					barsPerYear(test) ?? 1,
					test
				)
			);
		}
	);
});
