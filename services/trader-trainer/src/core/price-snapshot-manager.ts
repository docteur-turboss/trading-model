import type { Price } from "@trading-model/common/domain/primitives";
import type { TradingSymbol } from "./market-data-types";

export class PriceSnapshotManager {
	private _snapshot: Record<TradingSymbol, Price> = {} as Record<
		TradingSymbol,
		Price
	>;

	setSnapshot(prices: Record<TradingSymbol, Price>): void {
		this._snapshot = { ...this._snapshot, ...prices };
	}

	getSnapshot(): Record<TradingSymbol, Price> {
		return { ...this._snapshot };
	}
}
