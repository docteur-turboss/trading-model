import { Volume } from "@trading-model/common/domain/primitives";
import { ActionSpace, TradeAction } from "./action-types";

export interface ActionMap {
	action: TradeAction;
	amount: Volume;
}

export interface ActionMapperConfig {
	actionSpace?: ActionSpace;
	tradeAmount?: Volume;
}

type ActionSpaceStrategy = (
	output: Float32Array,
	amount: Volume,
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

function _softmaxSample(output: Float32Array, temperature: number): number {
	const scaled = output.map((val) => val / temperature);
	const maxVal = Math.max(...scaled);
	const exponentials = scaled.map((val) => Math.exp(val - maxVal));
	const total = exponentials.reduce((acc, val) => acc + val, 0);
	let roll = Math.random() * total;
	for (let idx = 0; idx < exponentials.length; idx++) {
		roll -= exponentials[idx];
		if (roll <= 0) {
			return idx;
		}
	}
	return exponentials.length - 1;
}

const ACTION_SPACE_STRATEGIES: Record<ActionSpace, ActionSpaceStrategy> = {
	[ActionSpace.Continuous]: (
		output: Float32Array,
		amount: Volume,
		epsilon?: number,
		_temperature?: number
	): ActionMap => {
		const val = output[0] ?? 0;
		if (epsilon !== undefined && Math.random() < epsilon) {
			const roll = Math.random();
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
	},
	[ActionSpace.Discrete]: (
		output: Float32Array,
		amount: Volume,
		epsilon?: number,
		temperature?: number
	): ActionMap => {
		let idx: number;
		if (epsilon !== undefined && Math.random() < epsilon) {
			idx = Math.floor(Math.random() * output.length);
		} else if (temperature !== undefined && temperature !== 1.0) {
			idx = _softmaxSample(output, temperature);
		} else {
			idx = _greedyDiscreteAction(output);
		}
		return {
			action: DISCRETE_ACTIONS.get(idx) ?? TradeAction.Hold,
			amount:
				DISCRETE_ACTIONS.get(idx) === TradeAction.Hold
					? Volume.zero()
					: Volume.of(amount),
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
		return strategy(output, amount, epsilon, temperature);
	}
}
