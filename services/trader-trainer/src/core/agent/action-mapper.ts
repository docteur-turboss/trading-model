import { Volume } from "@trading-model/common/domain/primitives";

export interface ActionMap {
	action: "buy" | "sell" | "hold";
	amount: Volume;
}

export interface ActionMapperConfig {
	actionSpace?: "discrete" | "continuous";
	tradeAmount?: Volume;
}

export class ActionMapper {
	private readonly _config: ActionMapperConfig;

	constructor(config?: ActionMapperConfig) {
		this._config = {
			actionSpace: "discrete",
			tradeAmount: Volume.of(1),
			...config,
		};
	}

	map(output: Float32Array): ActionMap {
		const space = this._config.actionSpace ?? "discrete";
		const amount = this._config.tradeAmount ?? Volume.of(1);

		if (space === "continuous") {
			return this._mapContinuous(output, amount);
		}
		return this._mapDiscrete(output, amount);
	}

	private _mapContinuous(output: Float32Array, amount: Volume): ActionMap {
		const val = output[0] ?? 0;
		if (val > 0.25) {
			return {
				action: "buy",
				amount: Volume.of(Math.max(1, Math.round(val * Number(amount)))),
			};
		}
		if (val < -0.25) {
			return {
				action: "sell",
				amount: Volume.of(Math.max(1, Math.round(-val * Number(amount)))),
			};
		}
		return { action: "hold", amount: Volume.zero() };
	}

	private _mapDiscrete(output: Float32Array, amount: Volume): ActionMap {
		let idx = 0;
		for (let i = 1; i < output.length; i++) {
			if (output[i] > output[idx]) {
				idx = i;
			}
		}
		if (idx === 0) {
			return { action: "sell", amount: Volume.of(amount) };
		}
		if (idx === 1) {
			return { action: "hold", amount: Volume.zero() };
		}
		return { action: "buy", amount: Volume.of(amount) };
	}
}
