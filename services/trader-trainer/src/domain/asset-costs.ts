import { toSymbol } from "@trading-model/primitives/primitives";
import { AssetType } from "@trading-model/validation/wire/signals";
import type { SimulatorCosts } from "./genetic-algorithm/rl-backend";
import type { TradingSymbol } from "./market-data-types";

export const DAY_MS = 86_400_000;

/**
 * Execution costs of a daily asset by type (ADR-0082): a fee plus the
 * half-spread and slippage of liquid listed products; real estate funds trade
 * wider. The crypto costs stay `SIMULATOR_PARAMS` (ADR-0066).
 */
export const DEFAULT_ASSET_COSTS: Record<AssetType, SimulatorCosts> = {
	crypto: { feeRate: 0.001, executionCostRate: 0.0005 },
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
			return [toSymbol(asset), AssetType.parse(type)];
		})
	);
}
