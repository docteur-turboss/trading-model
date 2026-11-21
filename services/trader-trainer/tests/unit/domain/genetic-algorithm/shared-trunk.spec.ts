import { describe, expect, it, jest } from "@jest/globals";
import { FeatureVector } from "@trading-model/model-runtime/feature-vector";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { Trainer } from "../../../../src/application/trainer";
import { runInProcess } from "../../../../src/application/training-session";
import { FitnessType } from "../../../../src/domain/genetic-algorithm/genome";
import { makeSeededBackendFactory } from "../../../../src/domain/genetic-algorithm/rl-backend";
import {
	trunkOf,
	trunkSha256,
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

async function run(group: boolean) {
	const buffer = new MarketDataBuffer({ maxSize: 600 } as never);
	feedCandles(buffer, "BTCUSDT", 500);
	feedCandles(buffer, "ETHUSDT", 500);
	const saved: NewModelArtifact[] = [];
	const models = {
		save: async (artifact: NewModelArtifact) => {
			saved.push(artifact);
			return { version: "v", sha256: "0".repeat(64), createdAt: "2026-01-01" };
		},
	};
	const trainer = new Trainer(buffer, {
		settings: SETTINGS,
		runner: runInProcess,
		models: models as never,
	});
	const result = group
		? await trainer.trainGroup([A, B])
		: await trainer.train(A);
	expect(result.success).toBe(true);
	return saved;
}

describe("FEATURE_SHARED_TRUNK", () => {
	it("flag off: one self-contained model, same genome as before", async () => {
		const [first, ...others] = await run(false);
		expect(others).toEqual([]);
		expect(first.components).toBeUndefined();
		expect(first.bestGenome).not.toHaveProperty("heads");
		const again = (await run(false))[0];
		expect(Array.from(again.weights)).toEqual(Array.from(first.weights));
	}, 120_000);

	it("flag on: one asset model per symbol, same trunk component, weights reload to the same output", async () => {
		const saved = await run(true);
		expect(saved.map((model) => model.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
		const [a, b] = saved;
		const genome = a.bestGenome;
		expect(a.components).toEqual(b.components);
		expect(a.components?.[0].sha256).toBe(trunkSha256(a.weights, genome));
		expect(Array.from(trunkOf(a.weights, genome))).toEqual(
			Array.from(trunkOf(b.weights, genome))
		);
		expect(Array.from(a.weights)).not.toEqual(Array.from(b.weights));

		const input = FeatureVector.fromFloat32Array(new Float32Array(1));
		const output = (seed: number) => {
			const backend = makeSeededBackendFactory(seed)(genome);
			backend.setWeights(a.weights);
			return Array.from(backend.forwardPass(input));
		};
		expect(output(1)).toEqual(output(2));
	}, 120_000);

	it("manifest: components is optional and kept when set", () => {
		const base = {
			symbol: "BTCUSDT",
			instanceId: "t",
			bestGenome: { network: {}, heads: {} } as never,
			weights: new Float32Array([1]),
			features: { dim: 1, fields: ["close"] },
			normalization: {},
			summary: { generation: 1, fitness: 1, sharpe: 1, avgPnl: 1 } as never,
		};
		const stored = { version: "v", createdAt: new Date(0), sha256: "0" };
		const components = [
			{ role: "trunk" as const, id: "trunk:ab", version: "ab", sha256: "ab" },
		];
		expect(buildModelManifest(base, stored)).not.toHaveProperty("components");
		const manifest = buildModelManifest({ ...base, components }, stored);
		expect(manifest.components).toEqual(components);
		expect(manifest.genome).not.toHaveProperty("heads");
	});
});
