import { TradeSide } from "@trading-model/common/contracts/market-data.types";
import type { TradeData } from "@trading-model/common/config/event.types";
import type { FeatureContext } from "../feature-context";
import type { FeatureVector } from "../feature-vector";
import type { SymbolState } from "../market-data-types";

function filterRecentTrades(
	trades: TradeData[],
	sinceTimestamp: number
): TradeData[] {
	return trades.filter((trade) => trade.timestamp >= sinceTimestamp);
}

function setTradeFeatures(
	features: FeatureVector,
	state: SymbolState,
	recentTrades: TradeData[]
): void {
	const avgPrice =
		recentTrades.reduce((acc, trade) => acc + trade.price, 0) /
		recentTrades.length;
	const totalQty = recentTrades.reduce((acc, trade) => acc + trade.quantity, 0);
	const buyQty = recentTrades
		.filter((trade) => trade.side === TradeSide.BUY)
		.reduce((acc, trade) => acc + trade.quantity, 0);
	features.trade.avgPrice = state.norm.tradePrice.normalize(avgPrice);
	features.trade.totalQty = state.norm.tradeQty.normalize(totalQty);
	features.trade.buyRatio = totalQty > 0 ? buyQty / totalQty : 0.5;
}

export function buildTradeFeatures(ctx: FeatureContext): void {
	const { features, state, idx } = ctx;
	const cur = state.candles[idx];
	const recentTrades = filterRecentTrades(state.trades, cur.timestamp - 60000);
	if (recentTrades.length > 0) {
		setTradeFeatures(features, state, recentTrades);
	}
}
