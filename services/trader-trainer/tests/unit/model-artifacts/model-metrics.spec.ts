import { describe, expect, it } from "@jest/globals";
import type {
	Fitness,
	PositiveInt,
	Ratio,
} from "@trading-model/primitives/primitives";
import { DurationMs, Price } from "@trading-model/primitives/primitives";
import { ModelPublisher } from "../../../src/adapters/outbound/model-publisher";
import { NETWORK_INPUT_LAYOUT } from "../../../src/domain/agent/agent-state";
import { FEATURE_LAYOUT } from "../../../src/domain/feature-vector-codec";
import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../src/domain/genetic-algorithm/genome-types";
import type { DeepReadonly } from "../../../src/domain/genetic-algorithm/shared-types";
import { buildSummary } from "../../../src/domain/genome-summary-builder";
import { assessAdmission } from "../../../src/domain/model-admission";
import { buildModelManifest } from "../../../src/domain/model-artifact";

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
});

describe("admission of a model (ADR-0069)", () => {
	// Per bar: Sharpe 0.335, Sortino 0.8, Calmar 0.4 (mean 0.4, drawdown 1).
	const curve = new EpisodeScores([1, -0.5, 2, 0.5, -1]);
	const bars = (prices: number[]) =>
		prices.map((price) => ({ price: Price.of(price), features: [] as never }));
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
});
