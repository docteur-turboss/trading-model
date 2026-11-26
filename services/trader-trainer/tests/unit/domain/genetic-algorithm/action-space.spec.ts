import { describe, expect, test } from "@jest/globals";
import {
	ACTION_SET_IDS,
	ACTION_SETS,
	actionLabels,
} from "@trading-model/model-runtime/agent/action-mapper";
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
import { TradingAgent } from "../../../../src/domain/agent/trading-agent";
import { createDefaultGenome } from "../../../../src/domain/genetic-algorithm/factory";
import type { LamarckGenome } from "../../../../src/domain/genetic-algorithm/genome";
import { crossoverNetwork } from "../../../../src/domain/genetic-algorithm/genome-network/crossover";
import { mutateNetworkStructure } from "../../../../src/domain/genetic-algorithm/genome-network/mutation";

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

const agentWith = (pick: number) => {
	let call = 0;
	return new TradingAgent({
		nnConfig: {
			neuronsByLayer: [5 as PositiveInt, 4 as PositiveInt, 5 as PositiveInt],
			activationType: [ActivationType.Relu, ActivationType.Linear],
			initialisationType: InitialisationType.Zeros,
			normalisationType: NormalisationType.None,
			connectionType: ConnectionType.FullyConnected,
			learningRate: 0.01 as Percentage,
			rng: () => (call++ % 2 === 0 ? 0 : pick),
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
};
const position = (a: TradingAgent) => Number(a.wallet.getPosition());
const x = new Float32Array(4);

describe("action space gene", () => {
	test("sets size the output layer; labels are ordered", () => {
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
			expect(child.outputDim).toBe(
				ACTION_SETS[child.actionSet ?? "sell_hold_buy"].length
			);
		}
	});

	test("flag off: same seed gives the same network, no set key, no rng drawn for it", () => {
		const base = createDefaultGenome("m") as LamarckGenome;
		const draws = (gaControl: LamarckGenome["gaControl"]) => {
			let n = 0;
			const net = mutateNetworkStructure({
				genome: { ...base, gaControl },
				mutationConfig: base.mutation,
				rng: () => {
					n++;
					return 0.99;
				},
			});
			return { net, n };
		};
		const off = draws(base.gaControl);
		const on = draws({ ...base.gaControl, actionSetGene: true });
		expect(off.net).toEqual({
			...base.network,
			hiddenLayers: off.net.hiddenLayers,
			normalization: off.net.normalization,
		});
		expect("actionSet" in off.net).toBe(false);
		expect(off.net.outputDim).toBe(3);
		expect(on.n).toBe(off.n + 1);
		const same = crossoverNetwork({
			left: base.network,
			right: base.network,
			rng: () => 0.99,
		});
		expect("actionSet" in same).toBe(false);
	});

	test("orders never exceed the cap (a buy too dear at the fill price is reduced) or the position", () => {
		const sellAll = agentWith(0);
		sellAll.step(x);
		expect(position(sellAll)).toBe(0);

		const buy = agentWith(0.99);
		buy.step(x);
		expect(position(buy)).toBe(5);
		buy.step(x);
		expect(position(buy)).toBe(5);

		const dearFill = agentWith(0.99);
		dearFill.step(x, Price.of(100), Price.of(110));
		// sized on the close (5 units); the simulator reduces it to the cap at 110 (500 / 110)
		expect(position(dearFill)).toBeCloseTo(500 / 110, 6);
	});
});
