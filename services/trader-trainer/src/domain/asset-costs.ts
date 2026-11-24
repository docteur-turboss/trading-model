import { AssetType } from "@trading-model/contracts/wire/signals";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import {
	SIMULATOR_PARAMS,
	type SimulatorCosts,
} from "./genetic-algorithm/rl-backend";

/**
 * Execution costs of a daily asset by type (ADR-0083): a fee plus the
 * half-spread and slippage of liquid listed products; real estate funds trade
 * wider. The crypto costs stay `SIMULATOR_PARAMS` (ADR-0066).
 */
export const DEFAULT_ASSET_COSTS: Record<AssetType, SimulatorCosts> = {
	crypto: {
		feeRate: SIMULATOR_PARAMS.feeRate,
		executionCostRate: SIMULATOR_PARAMS.executionCostRate,
	},
	equity: { feeRate: 0.0005, executionCostRate: 0.0005 },
	etf: { feeRate: 0.0005, executionCostRate: 0.0003 },
	bond: { feeRate: 0.0005, executionCostRate: 0.0005 },
	real_estate: { feeRate: 0.0005, executionCostRate: 0.001 },
	commodity_proxy: { feeRate: 0.0005, executionCostRate: 0.0005 },
};

/** `ASSET:type` pairs (`AAPL:equity,AGG:bond`) of TRAINER_ASSETS: the assets trained on daily bars. */
export function parseAssets(csv: string[]): Map<TradingSymbol, AssetType> {
	return new Map(
		csv.map((pair) => {
			const [asset, type] = pair.split(":");
			const parsed = AssetType.safeParse(type);
			if (!(asset && parsed.success)) {
				throw new Error(
					`TRAINER_ASSETS entry "${pair}" must be ASSET:type, type one of ${AssetType.options.join(", ")}`
				);
			}
			return [TradingSymbol.of(asset), parsed.data];
		})
	);
}
