import {
	type BookTickerData,
	type CandleData,
	getAvgAsk,
	getAvgBid,
	type OrderBookData,
	type TickerData,
	type TradeData,
} from "@trading-model/common/config/event.types";

import { NormalizationStats, type SymbolNormalizers, type SymbolState } from "./market-data-types";

export class NormalizationManager {
	createNormStats(): SymbolNormalizers {
		return {
			candleClose: new NormalizationStats(),
			candleVolume: new NormalizationStats(),
			candleOpen: new NormalizationStats(),
			candleHigh: new NormalizationStats(),
			candleLow: new NormalizationStats(),
			tradePrice: new NormalizationStats(),
			tradeQty: new NormalizationStats(),
			bid: new NormalizationStats(),
			ask: new NormalizationStats(),
			spread: new NormalizationStats(),
			tickerVolume: new NormalizationStats(),
		};
	}

	updateCandleNorms(state: SymbolState, candle: CandleData): void {
		state.norm.candleClose.update(candle.close);
		state.norm.candleVolume.update(candle.volume);
		state.norm.candleOpen.update(candle.open);
		state.norm.candleHigh.update(candle.high);
		state.norm.candleLow.update(candle.low);
	}

	updateTradeNorms(state: SymbolState, trade: TradeData): void {
		state.norm.tradePrice.update(trade.price);
		state.norm.tradeQty.update(trade.quantity);
	}

	updateOrderBookNorms(state: SymbolState, orderBook: OrderBookData): void {
		const avgBid = getAvgBid(orderBook);
		const avgAsk = getAvgAsk(orderBook);
		if (avgBid > 0) {
			state.norm.bid.update(avgBid);
		}
		if (avgAsk > 0) {
			state.norm.ask.update(avgAsk);
		}
		if (avgAsk > 0 && avgBid > 0) {
			state.norm.spread.update(avgAsk - avgBid);
		}
	}

	updateBookTickerNorms(state: SymbolState, bt: BookTickerData): void {
		if (bt.bid > 0) {
			state.norm.bid.update(bt.bid);
		}
		if (bt.ask > 0) {
			state.norm.ask.update(bt.ask);
		}
		if (bt.ask > 0 && bt.bid > 0) {
			state.norm.spread.update(bt.ask - bt.bid);
		}
	}

	updateTicker24hNorms(state: SymbolState, ticker: TickerData): void {
		state.norm.tickerVolume.update(ticker.volume);
	}
}
