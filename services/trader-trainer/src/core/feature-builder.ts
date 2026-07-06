import {
	type CandleData,
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
} from "@trading-model/common/config/event.types";

import {
	FEATURE_DIM,
	type SymbolState,
	toSymbol,
} from "./market-data-types";

import type {
	CandleFeatureContext,
	FeatureBuilderContext,
	PriceSnapshotFeatureContext,
} from "./feature-context";

import type { OrderBookAverages } from "./order-book-averages";
import { FeatureIndex } from "./feature-indices";

function _initFeatures(state: SymbolState, idx: number): {
	features: Float32Array;
	cur: import("@trading-model/common/config/event.types").CandleData;
	prev: import("@trading-model/common/config/event.types").CandleData | undefined;
} {
	return {
		features: new Float32Array(FEATURE_DIM),
		cur: state.candles[idx],
		prev: state.candles[idx - 1],
	};
}

export function buildFeatures(
	ctx: FeatureBuilderContext
): Float32Array {
	const { state, idx, priceSnapshot } = ctx;
	const { features, cur, prev } = _initFeatures(state, idx);

	_buildCandleFeatures({ features, state, idx, prev });
	_buildOrderBookFeatures(features, state);
	_buildBookTickerFeatures(features, state);
	_buildTradeFeatures(features, state, cur);
	_buildTickerFeatures(features, state);
	_buildPriceSnapshotFeature({ features, state, idx, priceSnapshot });
	_buildSlidingWindowFeatures(features, state, idx);

	features[FeatureIndex.Bias] = 1.0;
	return features;
}

function _candleReturnRatio(cur: import("@trading-model/common/config/event.types").CandleData, prev?: import("@trading-model/common/config/event.types").CandleData): number {
	return prev && prev.close > 0 ? (cur.close - prev.close) / prev.close : 0;
}

function _candlePositionRatio(cur: import("@trading-model/common/config/event.types").CandleData): number {
	return cur.high - cur.low > 0 ? (cur.close - cur.open) / (cur.high - cur.low) : 0;
}

function _candleRangeRatio(cur: import("@trading-model/common/config/event.types").CandleData): number {
	return cur.close > 0 ? (cur.high - cur.low) / cur.close : 0;
}

function _candleVolumeRatio(cur: import("@trading-model/common/config/event.types").CandleData, state: SymbolState): number {
	const volStd = state.norm.candleVolume.getStd();
	return volStd > 1e-10 ? cur.volume / volStd : 0;
}

function _buildCandleFeatures(
	ctx: CandleFeatureContext
): void {
	const { features, state, idx } = ctx;
	const cur = state.candles[idx];
	features[FeatureIndex.CandleClose] = state.norm.candleClose.normalize(cur.close);
	features[FeatureIndex.CandleVolume] = state.norm.candleVolume.normalize(cur.volume);
	features[FeatureIndex.CandleReturnRatio] = _candleReturnRatio(cur, ctx.prev);
	features[FeatureIndex.CandlePositionRatio] = _candlePositionRatio(cur);
	features[FeatureIndex.CandleRangeRatio] = _candleRangeRatio(cur);
	features[FeatureIndex.CandleOpen] = state.norm.candleOpen.normalize(cur.open);
	features[FeatureIndex.CandleHigh] = state.norm.candleHigh.normalize(cur.high);
	features[FeatureIndex.CandleLow] = state.norm.candleLow.normalize(cur.low);
	features[FeatureIndex.CandleVolumeRatio] = _candleVolumeRatio(cur, state);
}

function _buildOrderBookFeatures(
	features: Float32Array,
	state: SymbolState
): void {
	const obAvg = orderBookAverages(state);
	if (obAvg) {
		features[FeatureIndex.OrderBookAvgBid] = state.norm.bid.normalize(obAvg.avgBid);
		features[FeatureIndex.OrderBookAvgAsk] = state.norm.ask.normalize(obAvg.avgAsk);
		features[FeatureIndex.OrderBookSpreadRatio] =
			obAvg.avgAsk > 0 && obAvg.avgBid > 0
				? (obAvg.avgAsk - obAvg.avgBid) / obAvg.avgAsk
				: 0;
		const totalQty = obAvg.bidQty + obAvg.askQty;
		features[FeatureIndex.OrderBookImbalance] = totalQty > 0 ? (obAvg.bidQty - obAvg.askQty) / totalQty : 0;
	}
}

function _buildBookTickerFeatures(
	features: Float32Array,
	state: SymbolState
): void {
	if (state.bookTicker) {
		const bt = state.bookTicker;
		features[FeatureIndex.BookTickerBid] = state.norm.bid.normalize(bt.bid);
		features[FeatureIndex.BookTickerAsk] = state.norm.ask.normalize(bt.ask);
		const spread = bt.ask - bt.bid;
		features[FeatureIndex.BookTickerSpreadRatio] = bt.ask > 0 ? spread / bt.ask : 0;
	}
}

function _filterRecentTrades(
	trades: import("@trading-model/common/config/event.types").TradeData[],
	sinceTimestamp: number
): import("@trading-model/common/config/event.types").TradeData[] {
	return trades.filter((trade) => trade.timestamp >= sinceTimestamp);
}

function _setTradeFeatures(
	features: Float32Array,
	state: SymbolState,
	recentTrades: import("@trading-model/common/config/event.types").TradeData[]
): void {
	const avgPrice = recentTrades.reduce((acc, trade) => acc + trade.price, 0) / recentTrades.length;
	const totalQty = recentTrades.reduce((acc, trade) => acc + trade.quantity, 0);
	const buyQty = recentTrades
		.filter((trade) => trade.side === "buy")
		.reduce((acc, trade) => acc + trade.quantity, 0);
	features[FeatureIndex.TradeAvgPrice] = state.norm.tradePrice.normalize(avgPrice);
	features[FeatureIndex.TradeTotalQty] = state.norm.tradeQty.normalize(totalQty);
	features[FeatureIndex.TradeBuyRatio] = totalQty > 0 ? buyQty / totalQty : 0.5;
}

function _buildTradeFeatures(
	features: Float32Array,
	state: SymbolState,
	cur: CandleData
): void {
	const recentTrades = _filterRecentTrades(state.trades, cur.timestamp - 60000);
	if (recentTrades.length > 0) {
		_setTradeFeatures(features, state, recentTrades);
	}
}

function _buildTickerFeatures(
	features: Float32Array,
	state: SymbolState
): void {
	if (state.ticker24h) {
		const tk = state.ticker24h;
		features[FeatureIndex.TickerPriceChange] = tk.open > 0 ? (tk.last - tk.open) / tk.open : 0;
		features[FeatureIndex.TickerVolume] = state.norm.tickerVolume.normalize(tk.volume);
		features[FeatureIndex.TickerDailyRange] = tk.open > 0 ? (tk.high - tk.low) / tk.open : 0;
	}
}

function _buildPriceSnapshotFeature(
	ctx: PriceSnapshotFeatureContext
): void {
	const { features, state, idx, priceSnapshot } = ctx;
	const cur = state.candles[idx];
	const snapPrice =
		priceSnapshot[toSymbol(state.candles[idx].symbol)] ?? cur.close;
	features[FeatureIndex.PriceSnapshot] = state.norm.candleClose.normalize(snapPrice);
}

function _buildSlidingWindowFeatures(
	features: Float32Array,
	state: SymbolState,
	idx: number
): void {
	const lookbackStart = Math.max(0, idx - 8);
	let fi = FeatureIndex.SlidingWindowStart;
	for (let j = lookbackStart; j < idx && fi < FeatureIndex.SlidingWindowEnd; j++) {
		features[fi++] = state.norm.candleClose.normalize(state.candles[j].close);
	}
	while (fi < FeatureIndex.SlidingWindowEnd) {
		features[fi++] = 0;
	}
}

function _computeOrderBookAverages(ob: import("@trading-model/common/config/event.types").OrderBookData): OrderBookAverages {
	return {
		avgBid: getAvgBid(ob),
		avgAsk: getAvgAsk(ob),
		bidQty: getBidTotalQty(ob),
		askQty: getAskTotalQty(ob),
	};
}

function orderBookAverages(state: SymbolState): OrderBookAverages | null {
	if (!state.orderBook) {
		return null;
	}
	return _computeOrderBookAverages(state.orderBook);
}
