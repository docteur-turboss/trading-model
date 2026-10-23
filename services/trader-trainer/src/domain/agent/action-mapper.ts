import { Volume } from "@trading-model/primitives/primitives";
import { ActionSpace, TradeAction } from "./action-types";

export interface ActionMap {
	action: TradeAction;
	amount: Volume;
	/** Output unit that drove the decision; the one Q-learning updates. */
	outputIndex: number;
}

export interface ActionMapperConfig {
	actionSpace?: ActionSpace;
	tradeAmount?: Volume;
	/** Uniform [0, 1) source for exploration; seed it to replay a run. */
	rng?: () => number;
}

type ActionSpaceStrategy = (
	output: Float32Array,
	amount: Volume,
	rng: () => number,
	epsilon?: number,
	temperature?: number
) => ActionMap;

const DISCRETE_ACTIONS: ReadonlyMap<number, TradeAction> = new Map([
	[0, TradeAction.Sell],
	[1, TradeAction.Hold],
	[2, TradeAction.Buy],
]);

function _greedyDiscreteAction(output: Float32Array): number {
	let idx = 0;
	for (let i = 1; i < output.length; i++) {
		if (output[i] > output[idx]) {
			idx = i;
		}
	}
	return idx;
}

function _softmaxSample(
	output: Float32Array,
	temperature: number,
	rng: () => number
): number {
	const scaled = output.map((val) => val / temperature);
	const maxVal = Math.max(...scaled);
	const exponentials = scaled.map((val) => Math.exp(val - maxVal));
	const total = exponentials.reduce((acc, val) => acc + val, 0);
	let roll = rng() * total;
	for (let idx = 0; idx < exponentials.length; idx++) {
		roll -= exponentials[idx];
		if (roll <= 0) {
			return idx;
		}
	}
	return exponentials.length - 1;
}

/** The continuous policy reads its decision from the first output unit only. */
const CONTINUOUS_OUTPUT_INDEX = 0;

function _continuousAction(
	output: Float32Array,
	amount: Volume,
	rng: () => number,
	epsilon?: number
): Omit<ActionMap, "outputIndex"> {
	const val = output[CONTINUOUS_OUTPUT_INDEX] ?? 0;
	if (epsilon !== undefined && rng() < epsilon) {
		const roll = rng();
		if (roll < 0.33) {
			return {
				action: TradeAction.Buy,
				amount: Volume.of(
					Math.max(1, Math.round(Math.abs(roll) * Number(amount)))
				),
			};
		}
		if (roll > 0.66) {
			return {
				action: TradeAction.Sell,
				amount: Volume.of(
					Math.max(1, Math.round(Math.abs(roll) * Number(amount)))
				),
			};
		}
		return { action: TradeAction.Hold, amount: Volume.zero() };
	}
	if (val > 0.25) {
		return {
			action: TradeAction.Buy,
			amount: Volume.of(Math.max(1, Math.round(val * Number(amount)))),
		};
	}
	if (val < -0.25) {
		return {
			action: TradeAction.Sell,
			amount: Volume.of(Math.max(1, Math.round(-val * Number(amount)))),
		};
	}
	return { action: TradeAction.Hold, amount: Volume.zero() };
}

const ACTION_SPACE_STRATEGIES: Record<ActionSpace, ActionSpaceStrategy> = {
	[ActionSpace.Continuous]: (output, amount, rng, epsilon) => ({
		..._continuousAction(output, amount, rng, epsilon),
		outputIndex: CONTINUOUS_OUTPUT_INDEX,
	}),
	[ActionSpace.Discrete]: (
		output: Float32Array,
		amount: Volume,
		rng: () => number,
		epsilon?: number,
		temperature?: number
	): ActionMap => {
		let idx: number;
		if (epsilon !== undefined && rng() < epsilon) {
			idx = Math.floor(rng() * output.length);
		} else if (temperature !== undefined && temperature !== 1.0) {
			idx = _softmaxSample(output, temperature, rng);
		} else {
			idx = _greedyDiscreteAction(output);
		}
		return {
			action: DISCRETE_ACTIONS.get(idx) ?? TradeAction.Hold,
			amount:
				DISCRETE_ACTIONS.get(idx) === TradeAction.Hold
					? Volume.zero()
					: Volume.of(amount),
			outputIndex: idx,
		};
	},
};

export class ActionMapper {
	private readonly _config: ActionMapperConfig;

	constructor(config?: ActionMapperConfig) {
		this._config = {
			actionSpace: ActionSpace.Discrete,
			tradeAmount: Volume.of(1),
			...config,
		};
	}

	map(output: Float32Array, epsilon?: number, temperature?: number): ActionMap {
		const space = this._config.actionSpace ?? ActionSpace.Discrete;
		const amount = this._config.tradeAmount ?? Volume.of(1);
		const strategy =
			ACTION_SPACE_STRATEGIES[space] ??
			ACTION_SPACE_STRATEGIES[ActionSpace.Discrete];
		const rng = this._config.rng ?? Math.random;
		return strategy(output, amount, rng, epsilon, temperature);
	}
}
