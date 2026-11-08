import { describe, expect, it } from "@jest/globals";
import { DurationMs } from "@trading-model/primitives/primitives";
import { ModelPublisher } from "../../../src/adapters/outbound/model-publisher";
import { NETWORK_INPUT_LAYOUT } from "../../../src/domain/agent/agent-state";
import { FEATURE_LAYOUT } from "../../../src/domain/feature-vector-codec";
import { EpisodeScores } from "../../../src/domain/genetic-algorithm/episode-scores";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../src/domain/genetic-algorithm/genome-types";
import type { DeepReadonly } from "../../../src/domain/genetic-algorithm/shared-types";
import { buildSummary } from "../../../src/domain/genome-summary-builder";
import { buildModelManifest } from "../../../src/domain/model-artifact";

/** cumulative PnL: 3, -2, 0, -4, 6 -> drawdown 7 (peak 3, trough -4). */
const EPISODES = [3, -5, 2, -4, 10];

function summaryOf(scores?: number[]) {
	const genome = createDefaultGenome("g-1", 4) as DeepReadonly<LamarckGenome>;
	return buildSummary(
		genome,
		1.5 as never,
		scores && {
			episodesRun: scores.length,
			computeMs: DurationMs.of(1000),
			efficiencyScore: 1,
			variance: 0,
			rawScores: new EpisodeScores(scores),
		}
	);
}

async function publishedPayload(scores?: number[]) {
	const posted: Record<string, unknown>[] = [];
	const publisher = new ModelPublisher(
		{
			post: {
				indirect: (payload: Record<string, unknown>) => {
					posted.push(payload);
					return Promise.resolve();
				},
			},
		} as never,
		{ trainerId: "trader-trainer", instanceId: "trader-trainer-1" }
	);
	await publisher.publish("BTCUSDT" as never, summaryOf(scores));
	return posted[0];
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
		const genome = createDefaultGenome("g-1", 4) as DeepReadonly<LamarckGenome>;
		const curve = new EpisodeScores([1, -0.5, 2, 0.5, -1]);
		const meta = {
			episodesRun: 1,
			computeMs: DurationMs.of(1),
			efficiencyScore: 1,
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
				bestGenome: createDefaultGenome("g-1", 4) as never,
				weights: new Float32Array([1]),
				features: { dim: 1, fields: ["close"] },
				normalization: {},
				summary: summaryOf(EPISODES),
			},
			{ version: "v", createdAt: new Date(0), sha256: "0".repeat(64) }
		);

		expect(manifest.metrics).toEqual({
			metricsVersion: 3,
			generation: 4,
			fitness: 1.5,
			sharpe: expect.any(Number),
			avgPnl: 1.2,
			maxDrawdown: 7,
		});
	});
});
