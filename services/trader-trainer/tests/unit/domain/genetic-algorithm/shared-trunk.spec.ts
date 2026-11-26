import { describe, expect, it, jest } from "@jest/globals";
import { FeatureVector } from "@trading-model/model-runtime/feature-vector";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import {
	runInProcess,
	type TrainingSessionResult,
} from "../../../../src/application/training-session";
import * as pipeline from "../../../../src/domain/genetic-algorithm/evaluation-pipeline";
import { createDefaultGenome } from "../../../../src/domain/genetic-algorithm/factory";
import { GenerationProcessor } from "../../../../src/domain/genetic-algorithm/generation-processor";
import { FitnessType } from "../../../../src/domain/genetic-algorithm/genome";
import { makeSeededBackendFactory } from "../../../../src/domain/genetic-algorithm/rl-backend";
import {
	rotatingWindowSets,
	trunkSha256,
	withHeadOf,
} from "../../../../src/domain/genetic-algorithm/shared-trunk";
import { MarketDataBuffer } from "../../../../src/domain/market-data-buffer";
import {
	buildModelManifest,
	type NewModelArtifact,
} from "../../../../src/domain/model-artifact";
import {
	symbolsPerGeneration,
	type TrainingSettings,
} from "../../../../src/domain/training-settings";
import { feedCandles } from "../../../fixtures/market-data.fixture";
import { makeTrainer } from "../../../fixtures/trainer-deps.fixture";

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
	const trainer = makeTrainer(buffer, {
		settings: SETTINGS,
		runner: async (...args) => {
			session = await runInProcess(...args);
			return session;
		},
		models: models as never,
		dailyCosts: options.dailyCosts ?? (() => undefined),
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
		expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(-75.257, 2);
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

describe("symbolsPerGeneration", () => {
	it("defaults to max(1, floor(N / 3)), refuses k above N", () => {
		expect(symbolsPerGeneration(0, 10)).toBe(3);
		expect(symbolsPerGeneration(0, 2)).toBe(1);
		expect(symbolsPerGeneration(10, 10)).toBe(10);
		expect(() => symbolsPerGeneration(11, 10)).toThrow(/\[1, 10\]/);
	});
});

describe("rotatingWindowSets", () => {
	const sets = ["A", "B", "C", "D", "E"].map((symbol) => ({ symbol }));
	const pick = (k: number | undefined, seed: number, generation: number) =>
		rotatingWindowSets(sets, k, seed, generation).map((ws) => ws.symbol);

	it("k = N, absent or without symbols: every window, same array", () => {
		expect(rotatingWindowSets(sets, 5, 0, 3)).toBe(sets);
		expect(rotatingWindowSets(sets, undefined, 0, 3)).toBe(sets);
		const plain = [{ id: 1 } as { symbol?: string }];
		expect(rotatingWindowSets(plain, 1, 0, 1)).toBe(plain);
	});

	it("k < N: deterministic, k symbols, each seen the same number of times to one", () => {
		const counts = new Map<string, number>();
		for (let generation = 1; generation <= 12; generation++) {
			const picked = pick(2, 7, generation);
			expect(picked).toEqual(pick(2, 7, generation));
			expect(picked).toHaveLength(2);
			for (const symbol of picked) {
				counts.set(symbol as string, (counts.get(symbol as string) ?? 0) + 1);
			}
		}
		const seen = [...counts.values()];
		expect(Math.max(...seen) - Math.min(...seen)).toBeLessThanOrEqual(1);
		expect(counts.size).toBe(5);
	});
});

describe("selectOnAllSymbols", () => {
	it("k < N: publishes the archive member best on all symbols, not on its slice", async () => {
		const windowSets = ["A", "B", "C"].map((symbol) => ({ symbol })) as any[];
		const cfg = { windowSets, symbolsPerGeneration: 1 } as any;
		const [lucky, robust] = [
			createDefaultGenome("a"),
			createDefaultGenome("b"),
		];
		const processor = new GenerationProcessor(cfg);
		(processor as any)._archive.update(
			[lucky, robust],
			[
				{ avgPnl: 9, sharpe: 0, negFlops: 0 },
				{ avgPnl: 1, sharpe: 9, negFlops: 0 },
			],
			[{ fitness: 9 }, { fitness: 1 }]
		);
		expect(processor.archiveBest?.genome).toBe(lucky);
		const score = new Map([
			[lucky, 0],
			[robust, 5],
		]);
		const spy = jest
			.spyOn(pipeline, "evaluateGenomeAllWindows")
			.mockImplementation(((genome: any, sets: any[]) => {
				expect(sets).toBe(windowSets);
				return Promise.resolve({
					updatedGenome: genome,
					meta: { efficiencyScore: score.get(genome) },
					objectives: {},
				});
			}) as any);
		await processor.selectOnAllSymbols();
		spy.mockRestore();
		expect(processor.archiveBest?.genome).toBe(robust);
		expect(processor.archiveBest?.fitness).toBe(5);
	});
});
