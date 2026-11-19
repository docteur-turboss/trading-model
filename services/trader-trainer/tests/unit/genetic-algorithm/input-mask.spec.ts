import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { makePRNG } from "@trading-model/crypto/prng";
import {
	crossoverInputMask,
	mutateInputMask,
} from "@trading-model/model-runtime/agent/input-mask";
import { FEATURE_LAYOUT } from "@trading-model/model-runtime/feature-vector-codec";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { Cash, Percentage, Price } from "@trading-model/primitives/primitives";
import { FileModelArtifactStore } from "../../../src/adapters/outbound/file-model-artifact-store";
import { TradingAgent } from "../../../src/domain/agent/trading-agent";
import { crossoverGenomes } from "../../../src/domain/genetic-algorithm/crossover/genome-crossover";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type {
	LamarckGenome,
	PopMember,
} from "../../../src/domain/genetic-algorithm/genome";
import { ActivationType } from "../../../src/domain/genetic-algorithm/genome-network/types";
import { mutateGenome } from "../../../src/domain/genetic-algorithm/mutation/mutate";
import { createOffspring } from "../../../src/domain/genetic-algorithm/offspring-factory";

// 21 market inputs: candle (0-8, 17), window (9-16), one signal metric (18-20).
const MARKET = 21;
// Recorded on the code before the gene: rng draws and network of one crossover + mutation.
const SNAPSHOT_RNG_CALLS = 82;
const SNAPSHOT_NETWORK =
	'{"inputDim":19,"outputDim":3,"hiddenLayers":[{"neurons":64,"activation":"relu","connectionType":"dense-skip","biasType":"zeros"},{"neurons":32,"activation":"relu","connectionType":"dense-skip","biasType":"zeros"}],"normalization":"none"}';

function agentWith(inputMask: boolean[] | undefined): TradingAgent {
	const base = new TradingAgent({
		nnConfig: {
			neuronsByLayer: [
				(MARKET + 1) as PositiveInt,
				6 as PositiveInt,
				3 as PositiveInt,
			],
			activationType: [ActivationType.Relu, ActivationType.Linear],
			rng: () => 0.3,
		},
		wallet: {
			initialCash: Cash.of(1000),
			initialPrice: Price.of(100),
			feeRate: Percentage.zero(),
			executionCostRate: Percentage.zero(),
		},
		inputMask,
	});
	base.setWeights(
		Float32Array.from(base.getWeights(), (_w, i) => Math.sin(i + 1))
	);
	return base;
}

const ones = new Float32Array(MARKET).fill(0.5);

describe("input mask gene (ADR-0082)", () => {
	it("keeps a valid mask through crossover and mutation", () => {
		let seed = 1;
		const rng = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		let mask = [true, false, true];
		for (let i = 0; i < 500; i++) {
			mask = mutateInputMask(
				crossoverInputMask(mask, [false, true, false], rng),
				() => 0.01
			);
			expect(mask).toHaveLength(3);
			expect(mask.some(Boolean)).toBe(true);
		}
	});

	it("a masked group changes neither the output nor the state", () => {
		const mask = [true, false, false];
		const a = agentWith(mask).forwardPass(ones);
		const other = ones.map((v, i) => (i >= 9 && i !== 17 ? v + 7 : v));
		expect(agentWith(mask).forwardPass(other).output).toEqual(a.output);
		const state = agentWith(mask).step(other).state;
		expect(
			[...state.slice(9, 17), ...state.slice(18, MARKET)].every((v) => v === 0)
		).toBe(true);
		expect(agentWith(undefined).forwardPass(other).output).not.toEqual(
			a.output
		);
	});

	it("flag on: all groups active", () => {
		expect(
			createDefaultGenome("g", 0 as PositiveInt, false, 22, 3).network.inputMask
		).toEqual([true, true, true]);
	});

	it("flag off: same seed, same evolved genome as before the gene", () => {
		let calls = 0;
		const counting = (rng: () => number) => () => {
			calls++;
			return rng();
		};
		const left = createDefaultGenome("a") as LamarckGenome;
		const right = createDefaultGenome("b") as LamarckGenome;
		const child = mutateGenome(
			crossoverGenomes(left, right, counting(makePRNG(7))),
			counting(makePRNG(8))
		);
		expect(child.network).not.toHaveProperty("inputMask");
		expect(calls).toBe(SNAPSHOT_RNG_CALLS);
		expect(JSON.stringify(child.network)).toBe(SNAPSHOT_NETWORK);
	});

	it("the manifest the store writes carries the mask, and replaying it gives the same outputs", async () => {
		const root = await mkdtemp(join(tmpdir(), "mask-"));
		try {
			const store = new FileModelArtifactStore({ root, retention: 5 });
			const manifest = async (inputMask?: boolean[]) => {
				const weight = inputMask ? 1 : 2;
				const { version } = await store.save({
					symbol: "BTCUSDT",
					instanceId: "t",
					bestGenome: {
						id: "g",
						network: { inputDim: 22, outputDim: 3, inputMask },
						trainedWeights: new Float32Array([weight]),
					} as never,
					weights: new Float32Array([weight]),
					features: FEATURE_LAYOUT,
					normalization: {},
					summary: { network: {} } as never,
				});
				return JSON.parse(
					await readFile(
						join(root, "BTCUSDT", version, "manifest.json"),
						"utf8"
					)
				);
			};
			const mask = [true, false, true];
			const written = await manifest(mask);
			expect(written.genome.network.inputMask).toEqual(mask);
			expect(
				agentWith(written.genome.network.inputMask).forwardPass(ones).output
			).toEqual(agentWith(mask).forwardPass(ones).output);
			expect((await manifest()).genome.network).not.toHaveProperty("inputMask");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("protectCandleGroup keeps the candle group active in every offspring", () => {
		const member = (id: string): PopMember =>
			({
				genome: {
					...createDefaultGenome(id, 1 as PositiveInt, false, 22, 3),
					network: {
						...createDefaultGenome(id).network,
						inputMask: [false, true, true],
					},
				},
				fitness: 1,
				fitnessMeta: {},
			}) as unknown as PopMember;
		const ranked = Array.from({ length: 40 }, (_u, i) => member(`m${i}`));
		const ctrl = ranked[0].genome.gaControl;
		const candleOn = (protectCandleGroup: boolean) =>
			createOffspring({
				ranked,
				newCtrl: ctrl,
				ctrl,
				rng: makePRNG(3),
				generation: 1,
				protectCandleGroup,
			}).map((g) => g.network.inputMask?.[0]);
		expect(candleOn(true).every(Boolean)).toBe(true);
		expect(candleOn(false).some((on) => !on)).toBe(true);
	});
});
