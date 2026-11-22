import { describe, expect, it, jest } from "@jest/globals";
import { FeatureVector } from "@trading-model/model-runtime/feature-vector";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { Trainer } from "../../../../src/application/trainer";
import {
	runInProcess,
	type TrainingSessionResult,
} from "../../../../src/application/training-session";
import { FitnessType } from "../../../../src/domain/genetic-algorithm/genome";
import { makeSeededBackendFactory } from "../../../../src/domain/genetic-algorithm/rl-backend";
import {
	trunkSha256,
	withHeadOf,
} from "../../../../src/domain/genetic-algorithm/shared-trunk";
import { MarketDataBuffer } from "../../../../src/domain/market-data-buffer";
import {
	buildModelManifest,
	type NewModelArtifact,
} from "../../../../src/domain/model-artifact";
import type { TrainingSettings } from "../../../../src/domain/training-settings";
import { feedCandles } from "../../../fixtures/market-data.fixture";

jest.mock("../../../../src/config/metrics", () => {
	const metric = {
		set: jest.fn<(...args: any[]) => any>(),
		inc: jest.fn<(...args: any[]) => any>(),
		observe: jest.fn<(...args: any[]) => any>(),
	};
	return new Proxy({}, { get: () => metric });
});

const SETTINGS: TrainingSettings = {
	validationSplit: 0.2,
	testSplit: 0.15,
	walkForwardFolds: 1,
	generations: 2,
	populationSize: 4,
	timeBudgetMs: 120_000,
	episodesPerIndividual: 1,
	fitnessType: FitnessType.TotalPnl,
};
const A = TradingSymbol.of("BTCUSDT");
const B = TradingSymbol.of("ETHUSDT");

async function run(
	group: boolean,
	options: {
		failSave?: string;
		dailyCosts?: (symbol: TradingSymbol) => never;
	} = {}
) {
	const buffer = new MarketDataBuffer({ maxSize: 600 } as never);
	feedCandles(buffer, "BTCUSDT", 500);
	feedCandles(buffer, "ETHUSDT", 500);
	const saved: NewModelArtifact[] = [];
	let session: TrainingSessionResult | undefined;
	const models = {
		list: async () => [],
		save: async (artifact: NewModelArtifact) => {
			if (artifact.symbol === options.failSave) {
				throw new Error("disk full");
			}
			saved.push(artifact);
			return { version: "v", sha256: "0".repeat(64), createdAt: "2026-01-01" };
		},
	};
	const trainer = new Trainer(buffer, {
		settings: SETTINGS,
		runner: async (...args) => {
			session = await runInProcess(...args);
			return session;
		},
		models: models as never,
		dailyCosts: options.dailyCosts,
	});
	const result = group
		? await trainer.trainGroup([A, B])
		: await trainer.train(A);
	return { saved, result, session: session as TrainingSessionResult };
}

describe("FEATURE_SHARED_TRUNK", () => {
	it("flag off: same published genome as before the change (reference computed on development)", async () => {
		const { saved, result } = await run(false);
		expect(result.success).toBe(true);
		const [first] = saved;
		expect(saved).toHaveLength(1);
		expect(first.components).toBeUndefined();
		expect(Object.keys(first.bestGenome).sort()).toEqual([
			"crossover",
			"gaControl",
			"generation",
			"id",
			"mutation",
			"network",
			"rl",
			"trainedWeights",
		]);
		const weights = Array.from(first.weights);
		expect(weights).toHaveLength(3459);
		expect(weights.slice(0, 6).map((w) => Number(w.toFixed(4)))).toEqual([
			0.8164, -0.7885, 0.9385, -0.1851, 0.0995, -0.0778,
		]);
		expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(-47.041, 2);
	}, 120_000);

	it("flag on: one asset model per symbol, same trunk component, reloaded output = training output", async () => {
		const { saved, session } = await run(true);
		expect(saved.map((model) => model.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
		const [a, b] = saved;
		const genome = a.bestGenome;
		expect(a.components).toEqual(b.components);
		expect(a.components?.[0].sha256).toBe(trunkSha256(a.weights, genome));
		expect(trunkSha256(b.weights, genome)).toBe(a.components?.[0].sha256);
		expect(Array.from(a.weights)).not.toEqual(Array.from(b.weights));

		const { inputDim } = session.bestGenome.network;
		const input = FeatureVector.fromFloat32Array(
			Float32Array.from({ length: inputDim - 1 }, (_v, i) => Math.sin(i + 1))
		);
		for (const model of saved) {
			// What the GA trained and scored: the group genome with this symbol's head.
			const trained = makeSeededBackendFactory(7)(
				withHeadOf(session.bestGenome, model.symbol)
			);
			const reloaded = makeSeededBackendFactory(99)(genome);
			reloaded.setWeights(model.weights);
			expect(Array.from(reloaded.forwardPass(input))).toEqual(
				Array.from(trained.forwardPass(input))
			);
		}
		const manifest = buildModelManifest(a, {
			version: "v",
			createdAt: new Date(0),
			sha256: "0",
		});
		expect(manifest.components).toEqual(a.components);
		expect(manifest.genome).not.toHaveProperty("heads");
	}, 120_000);

	it("flag on: one symbol failing to store does not stop the others", async () => {
		const { saved, result } = await run(true, { failSave: "BTCUSDT" });
		expect(result.success).toBe(true);
		expect(saved.map((model) => model.symbol)).toEqual(["ETHUSDT"]);
	}, 120_000);

	it("flag on: refuses a group mixing a daily and an intraday symbol", async () => {
		const costs = { fee: 0 } as never;
		const { saved, result } = await run(true, {
			dailyCosts: (symbol) => (symbol === B ? costs : (undefined as never)),
		});
		expect(saved).toEqual([]);
		expect(String(!result.success && result.error.message)).toContain(
			"mixes daily and intraday"
		);
	}, 120_000);
});
