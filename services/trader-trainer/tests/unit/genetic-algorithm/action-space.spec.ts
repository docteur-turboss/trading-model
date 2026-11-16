import { describe, expect, test } from "@jest/globals";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "@trading-model/model-runtime/neural-network/type";
import {
	Cash,
	Percentage,
	type PositiveInt,
	Price,
} from "@trading-model/primitives/primitives";
import {
	ACTION_SET_IDS,
	ACTION_SETS,
	actionLabels,
} from "../../../src/domain/agent/action-mapper";
import { TradingAgent } from "../../../src/domain/agent/trading-agent";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../src/domain/genetic-algorithm/genome";
import { crossoverNetwork } from "../../../src/domain/genetic-algorithm/genome-network/crossover";
import { mutateNetworkStructure } from "../../../src/domain/genetic-algorithm/genome-network/mutation";

const withSet = (id: (typeof ACTION_SET_IDS)[number]): LamarckGenome => {
	const g = createDefaultGenome("g") as LamarckGenome;
	return {
		...g,
		network: {
			...g.network,
			actionSet: id,
			outputDim: ACTION_SETS[id].length as PositiveInt,
		},
	};
};

describe("action space gene", () => {
	test("each set sizes the output layer; labels are ordered", () => {
		for (const id of ACTION_SET_IDS) {
			expect(actionLabels(id)).toHaveLength(ACTION_SETS[id].length);
		}
		expect(actionLabels("sell_hold_buy")).toEqual(["sell", "hold", "buy"]);
		expect(actionLabels("sized_50_100")[1]).toBe("sell_50");
	});

	test("crossover of two sets gives one parent's set and output size", () => {
		const a = withSet("sized_25_50_100").network;
		const b = createDefaultGenome("b").network;
		for (const r of [0.1, 0.9]) {
			const child = crossoverNetwork({ left: a, right: b, rng: () => r });
			const set = child.actionSet ?? "sell_hold_buy";
			expect(child.outputDim).toBe(ACTION_SETS[set].length);
		}
	});

	test("mutation changes the set only behind the gene", () => {
		const base = createDefaultGenome("m") as LamarckGenome;
		const mutationConfig = base.mutation;
		const rng = () => 0;
		const off = mutateNetworkStructure({ genome: base, mutationConfig, rng });
		expect(off.actionSet).toBeUndefined();
		expect(off.outputDim).toBe(3);
		const gaControl = { ...base.gaControl, actionSetGene: true };
		const on = mutateNetworkStructure({
			genome: { ...base, gaControl },
			mutationConfig,
			rng,
		});
		expect(on.outputDim).toBe(
			ACTION_SETS[on.actionSet ?? "sell_hold_buy"].length
		);
	});

	test("partial orders stay under the exposure cap and the position", () => {
		const seq = [0, 0.99]; // explore, last output
		let call = 0;
		const agent = new TradingAgent({
			nnConfig: {
				neuronsByLayer: [5 as PositiveInt, 4 as PositiveInt, 5 as PositiveInt],
				activationType: [ActivationType.Relu, ActivationType.Linear],
				initialisationType: InitialisationType.Zeros,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.FullyConnected,
				learningRate: 0.01 as Percentage,
				rng: () => (call++ % 2 === 0 ? seq[0] : seq[1]),
			},
			wallet: {
				initialCash: Cash.of(1000),
				initialPrice: Price.of(100),
				feeRate: Percentage.zero(),
				executionCostRate: Percentage.zero(),
				maxExposureFraction: 0.5,
			},
			actionSet: "sized_50_100",
			stateManagerCfg: { epsilonStart: 1, epsilonMin: 1, epsilonDecay: 1 },
		} as never);
		const x = new Float32Array(4);
		agent.step(x); // buy 100 % of the room: 5 units = 500 cash
		expect(Number(agent.wallet.getPosition())).toBe(5);
		agent.step(x); // room is 0: the order is refused, never exceeds the cap
		expect(Number(agent.wallet.getPosition())).toBe(5);
	});
});
