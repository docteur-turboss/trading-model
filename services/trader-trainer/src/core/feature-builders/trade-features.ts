import type { TradeData } from "@trading-model/common/config/event.types";
import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/common/domain/primitives";
import { TradeSide } from "@trading-model/validation/shared/contracts/market-data.types";
import type { FeatureContext } from "../feature-context";

function filterRecentTrades(
	trades: TradeData[],
	sinceTimestamp: number
): TradeData[] {
	return trades.filter((trade) => trade.timestamp >= sinceTimestamp);
}

function setTradeFeatures(
	ctx: FeatureContext,
	recentTrades: TradeData[]
): void {
	const { features, state } = ctx;
	const avgPrice =
		recentTrades.reduce((acc, trade) => acc + trade.price, 0) /
		recentTrades.length;
	const totalQty = recentTrades.reduce((acc, trade) => acc + trade.quantity, 0);
	const buyQty = recentTrades
		.filter((trade) => trade.side === TradeSide.Buy)
		.reduce((acc, trade) => acc + trade.quantity, 0);
	features.trade.avgPrice = state.norm.trade.price.normalize(avgPrice) as Price;
	features.trade.totalQty = state.norm.trade.qty.normalize(totalQty) as Volume;
	features.trade.buyRatio = (totalQty > 0 ? buyQty / totalQty : 0.5) as Ratio;
}

export function buildTradeFeatures(ctx: FeatureContext): void {
	const { state, idx } = ctx;
	const cur = state.candles[idx];
	const recentTrades = filterRecentTrades(state.trades, cur.timestamp - 60000);
	if (recentTrades.length > 0) {
		setTradeFeatures(ctx, recentTrades);
	}
}
