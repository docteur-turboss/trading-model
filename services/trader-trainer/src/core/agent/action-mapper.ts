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

type ActionSpaceStrategy = (output: Float32Array, amount: Volume) => ActionMap;

const ACTION_SPACE_STRATEGIES: Record<ActionSpace, ActionSpaceStrategy> = {
	[ActionSpace.Continuous]: (
		output: Float32Array,
		amount: Volume
	): ActionMap => {
		const val = output[0] ?? 0;
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
	[ActionSpace.Discrete]: (output: Float32Array, amount: Volume): ActionMap => {
		let idx = 0;
		for (let i = 1; i < output.length; i++) {
			if (output[i] > output[idx]) {
				idx = i;
			}
		}
		if (idx === 0) {
			return { action: TradeAction.Sell, amount: Volume.of(amount) };
		}
		if (idx === 1) {
			return { action: TradeAction.Hold, amount: Volume.zero() };
		}
		return { action: TradeAction.Buy, amount: Volume.of(amount) };
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

	map(output: Float32Array): ActionMap {
		const space = this._config.actionSpace ?? ActionSpace.Discrete;
		const amount = this._config.tradeAmount ?? Volume.of(1);
		const strategy =
			ACTION_SPACE_STRATEGIES[space] ??
			ACTION_SPACE_STRATEGIES[ActionSpace.Discrete];
		return strategy(output, amount);
	}
}
