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
	type TradingSymbol,
} from "./market-data-types";

export function buildFeatures(
	state: SymbolState,
	idx: number,
	priceSnapshot: Record<string, number>
): Float32Array {
	const features = new Float32Array(FEATURE_DIM);
	const cur = state.candles[idx];
	const prev = state.candles[idx - 1];

	_buildCandleFeatures(features, state, idx, prev);
	_buildOrderBookFeatures(features, state);
	_buildBookTickerFeatures(features, state);
	_buildTradeFeatures(features, state, cur);
	_buildTickerFeatures(features, state);
	_buildPriceSnapshotFeature(features, state, idx, priceSnapshot);
	_buildSlidingWindowFeatures(features, state, idx);

	features[31] = 1.0;

	return features;
}

function _buildCandleFeatures(
	features: Float32Array,
	state: SymbolState,
	idx: number,
	prev: CandleData | undefined
): void {
	const cur = state.candles[idx];
	features[0] = state.closeNorm.normalize(cur.close);
	features[1] = state.volumeNorm.normalize(cur.volume);
	features[2] =
		prev && prev.close > 0 ? (cur.close - prev.close) / prev.close : 0;
	features[3] =
		cur.high - cur.low > 0 ? (cur.close - cur.open) / (cur.high - cur.low) : 0;
	features[4] = cur.close > 0 ? (cur.high - cur.low) / cur.close : 0;
	features[5] = state.openNorm.normalize(cur.open);
	features[6] = state.highNorm.normalize(cur.high);
	features[7] = state.lowNorm.normalize(cur.low);

	const volStd = state.volumeNorm.getStd();
	features[8] = volStd > 1e-10 ? cur.volume / volStd : 0;
}

function _buildOrderBookFeatures(
	features: Float32Array,
	state: SymbolState
): void {
	const obAvg = orderBookAverages(state);
	if (obAvg) {
		features[9] = state.bidNorm.normalize(obAvg.avgBid);
		features[10] = state.askNorm.normalize(obAvg.avgAsk);
		features[11] =
			obAvg.avgAsk > 0 && obAvg.avgBid > 0
				? (obAvg.avgAsk - obAvg.avgBid) / obAvg.avgAsk
				: 0;
		const totalQty = obAvg.bidQty + obAvg.askQty;
		features[12] = totalQty > 0 ? (obAvg.bidQty - obAvg.askQty) / totalQty : 0;
	}
}

function _buildBookTickerFeatures(
	features: Float32Array,
	state: SymbolState
): void {
	if (state.bookTicker) {
		const bt = state.bookTicker;
		features[13] = state.bidNorm.normalize(bt.bid);
		features[14] = state.askNorm.normalize(bt.ask);
		const spread = bt.ask - bt.bid;
		features[15] = bt.ask > 0 ? spread / bt.ask : 0;
	}
}

function _buildTradeFeatures(
	features: Float32Array,
	state: SymbolState,
	cur: CandleData
): void {
	const recentTrades = state.trades.filter(
		(trade) => trade.timestamp >= cur.timestamp - 60000
	);
	if (recentTrades.length > 0) {
		const avgPrice =
			recentTrades.reduce((acc, trade) => acc + trade.price, 0) /
			recentTrades.length;
		const totalQty = recentTrades.reduce(
			(acc, trade) => acc + trade.quantity,
			0
		);
		const buyQty = recentTrades
			.filter((trade) => trade.side === "buy")
			.reduce((acc, trade) => acc + trade.quantity, 0);
		features[16] = state.tradePriceNorm.normalize(avgPrice);
		features[17] = state.tradeQtyNorm.normalize(totalQty);
		features[18] = totalQty > 0 ? buyQty / totalQty : 0.5;
	}
}

function _buildTickerFeatures(
	features: Float32Array,
	state: SymbolState
): void {
	if (state.ticker24h) {
		const tk = state.ticker24h;
		features[19] = tk.open > 0 ? (tk.last - tk.open) / tk.open : 0;
		features[20] = state.tickerVolumeNorm.normalize(tk.volume);
		features[21] = tk.open > 0 ? (tk.high - tk.low) / tk.open : 0;
	}
}

function _buildPriceSnapshotFeature(
	features: Float32Array,
	state: SymbolState,
	idx: number,
	priceSnapshot: Record<string, number>
): void {
	const cur = state.candles[idx];
	const snapPrice =
		priceSnapshot[state.candles[idx].symbol as TradingSymbol] ?? cur.close;
	features[22] = state.closeNorm.normalize(snapPrice);
}

function _buildSlidingWindowFeatures(
	features: Float32Array,
	state: SymbolState,
	idx: number
): void {
	const lookbackStart = Math.max(0, idx - 8);
	let fi = 23;
	for (let j = lookbackStart; j < idx && fi < 31; j++) {
		features[fi++] = state.closeNorm.normalize(state.candles[j].close);
	}
	while (fi < 31) {
		features[fi++] = 0;
	}
}

function orderBookAverages(state: SymbolState): {
	avgBid: number;
	avgAsk: number;
	bidQty: number;
	askQty: number;
} | null {
	if (state.orderBook) {
		const ob = state.orderBook;
		return {
			avgBid: getAvgBid(ob),
			avgAsk: getAvgAsk(ob),
			bidQty: getBidTotalQty(ob),
			askQty: getAskTotalQty(ob),
		};
	}
	return null;
}
