import { describe, expect, it } from "@jest/globals";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { Cash, Percentage, Price } from "@trading-model/primitives/primitives";
import { TradingAgent } from "../../../src/domain/agent/trading-agent";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import {
	crossoverInputMask,
	mutateInputMask,
} from "../../../src/domain/genetic-algorithm/genome-network/input-mask";

// 21 market inputs: candle (0-8, 17), window (9-16), one signal metric (18-20).
const MARKET = 21;

function agentWith(inputMask: boolean[] | undefined): TradingAgent {
	const base = new TradingAgent({
		nnConfig: {
			neuronsByLayer: [
				(MARKET + 1) as PositiveInt,
				6 as PositiveInt,
				3 as PositiveInt,
			],
			activationType: ["relu", "linear"],
			rng: () => 0.3,
		},
		wallet: {
			initialCash: Cash.of(1000),
			initialPrice: Price.of(100),
			feeRate: Percentage.zero(),
			executionCostRate: Percentage.zero(),
		},
		inputMask,
	} as never);
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

	it("flag off: the genome has no mask; on: all groups active", () => {
		expect(createDefaultGenome("g").network).not.toHaveProperty("inputMask");
		expect(
			createDefaultGenome("g", 0 as PositiveInt, false, 22, 3).network.inputMask
		).toEqual([true, true, true]);
	});

	it("replays the same outputs from the mask of a JSON manifest", () => {
		const mask = [true, false, true];
		const replayed = JSON.parse(
			JSON.stringify({ network: { inputMask: mask } })
		);
		expect(
			agentWith(replayed.network.inputMask).forwardPass(ones).output
		).toEqual(agentWith(mask).forwardPass(ones).output);
	});
});
