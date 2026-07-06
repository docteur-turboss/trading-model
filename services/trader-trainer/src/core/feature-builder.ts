import {
	type CandleData,
	type OrderBookData,
	type TradeData,
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
import { FeatureVector } from "./feature-vector";

function _initFeatures(state: SymbolState, idx: number): {
	features: FeatureVector;
	cur: CandleData;
	prev: CandleData | undefined;
} {
	return {
		features: new FeatureVector(),
		cur: state.candles[idx],
		prev: state.candles[idx - 1],
	};
}

export function buildFeatures(
	ctx: FeatureBuilderContext
): FeatureVector {
	const { state, idx, priceSnapshot } = ctx;
	const { features, cur, prev } = _initFeatures(state, idx);

	_buildCandleFeatures({ features, state, idx, prev });
	_buildOrderBookFeatures(features, state);
	_buildBookTickerFeatures(features, state);
	_buildTradeFeatures(features, state, cur);
	_buildTickerFeatures(features, state);
	_buildPriceSnapshotFeature({ features, state, idx, priceSnapshot });
	_buildSlidingWindowFeatures(features, state, idx);

	features.bias = 1.0;
	return features;
}

function _candleReturnRatio(cur: CandleData, prev?: CandleData): number {
	return prev && prev.close > 0 ? (cur.close - prev.close) / prev.close : 0;
}

function _candlePositionRatio(cur: CandleData): number {
	return cur.high - cur.low > 0 ? (cur.close - cur.open) / (cur.high - cur.low) : 0;
}

function _candleRangeRatio(cur: CandleData): number {
	return cur.close > 0 ? (cur.high - cur.low) / cur.close : 0;
}

function _candleVolumeRatio(cur: CandleData, state: SymbolState): number {
	const volStd = state.norm.candleVolume.getStd();
	return volStd > 1e-10 ? cur.volume / volStd : 0;
}

function _buildCandleFeatures(
	ctx: CandleFeatureContext
): void {
	const { features, state, idx } = ctx;
	const cur = state.candles[idx];
	features.candleClose = state.norm.candleClose.normalize(cur.close);
	features.candleVolume = state.norm.candleVolume.normalize(cur.volume);
	features.candleReturnRatio = _candleReturnRatio(cur, ctx.prev);
	features.candlePositionRatio = _candlePositionRatio(cur);
	features.candleRangeRatio = _candleRangeRatio(cur);
	features.candleOpen = state.norm.candleOpen.normalize(cur.open);
	features.candleHigh = state.norm.candleHigh.normalize(cur.high);
	features.candleLow = state.norm.candleLow.normalize(cur.low);
	features.candleVolumeRatio = _candleVolumeRatio(cur, state);
}

function _buildOrderBookFeatures(
	features: FeatureVector,
	state: SymbolState
): void {
	const obAvg = orderBookAverages(state);
	if (obAvg) {
		features.orderBookAvgBid = state.norm.bid.normalize(obAvg.avgBid);
		features.orderBookAvgAsk = state.norm.ask.normalize(obAvg.avgAsk);
		features.orderBookSpreadRatio =
			obAvg.avgAsk > 0 && obAvg.avgBid > 0
				? (obAvg.avgAsk - obAvg.avgBid) / obAvg.avgAsk
				: 0;
		const totalQty = obAvg.bidQty + obAvg.askQty;
		features.orderBookImbalance = totalQty > 0 ? (obAvg.bidQty - obAvg.askQty) / totalQty : 0;
	}
}

function _buildBookTickerFeatures(
	features: FeatureVector,
	state: SymbolState
): void {
	if (state.bookTicker) {
		const bt = state.bookTicker;
		features.bookTickerBid = state.norm.bid.normalize(bt.bid);
		features.bookTickerAsk = state.norm.ask.normalize(bt.ask);
		const spread = bt.ask - bt.bid;
		features.bookTickerSpreadRatio = bt.ask > 0 ? spread / bt.ask : 0;
	}
}

function _filterRecentTrades(
	trades: TradeData[],
	sinceTimestamp: number
): TradeData[] {
	return trades.filter((trade) => trade.timestamp >= sinceTimestamp);
}

function _setTradeFeatures(
	features: FeatureVector,
	state: SymbolState,
	recentTrades: TradeData[]
): void {
	const avgPrice = recentTrades.reduce((acc, trade) => acc + trade.price, 0) / recentTrades.length;
	const totalQty = recentTrades.reduce((acc, trade) => acc + trade.quantity, 0);
	const buyQty = recentTrades
		.filter((trade) => trade.side === "buy")
		.reduce((acc, trade) => acc + trade.quantity, 0);
	features.tradeAvgPrice = state.norm.tradePrice.normalize(avgPrice);
	features.tradeTotalQty = state.norm.tradeQty.normalize(totalQty);
	features.tradeBuyRatio = totalQty > 0 ? buyQty / totalQty : 0.5;
}

function _buildTradeFeatures(
	features: FeatureVector,
	state: SymbolState,
	cur: CandleData
): void {
	const recentTrades = _filterRecentTrades(state.trades, cur.timestamp - 60000);
	if (recentTrades.length > 0) {
		_setTradeFeatures(features, state, recentTrades);
	}
}

function _buildTickerFeatures(
	features: FeatureVector,
	state: SymbolState
): void {
	if (state.ticker24h) {
		const tk = state.ticker24h;
		features.tickerPriceChange = tk.open > 0 ? (tk.last - tk.open) / tk.open : 0;
		features.tickerVolume = state.norm.tickerVolume.normalize(tk.volume);
		features.tickerDailyRange = tk.open > 0 ? (tk.high - tk.low) / tk.open : 0;
	}
}

function _buildPriceSnapshotFeature(
	ctx: PriceSnapshotFeatureContext
): void {
	const { features, state, idx, priceSnapshot } = ctx;
	const cur = state.candles[idx];
	const snapPrice =
		priceSnapshot[toSymbol(state.candles[idx].symbol)] ?? cur.close;
	features.priceSnapshot = state.norm.candleClose.normalize(snapPrice);
}

function _buildSlidingWindowFeatures(
	features: FeatureVector,
	state: SymbolState,
	idx: number
): void {
	const sw = features.slidingWindow();
	const lookbackStart = Math.max(0, idx - 8);
	let swIdx = 0;
	for (let j = lookbackStart; j < idx && swIdx < sw.length; j++) {
		sw[swIdx++] = state.norm.candleClose.normalize(state.candles[j].close);
	}
	while (swIdx < sw.length) {
		sw[swIdx++] = 0;
	}
}

function _computeOrderBookAverages(ob: OrderBookData): OrderBookAverages {
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
