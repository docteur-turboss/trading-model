import type { HELPER } from "@trading-model/broker-message";
import { EnumEventMessage } from "@trading-model/common/config/event.types";
import { MessageManager } from "../../config/message-manager";
import { type MarketDataEntry, makeEntry } from "./binance-worker-helpers";
import type { BinanceWorkerResult } from "./binance-worker-types";

export interface MarketDataContext extends MarketDataEntry {
	builder: typeof HELPER.metadataBuilder.prototype;
}

export function buildMarketDataEntries(
	response: BinanceWorkerResult
): MarketDataEntry[] {
	return [
		makeEntry(
			response.candles,
			EnumEventMessage.fetchCandlestickSeries,
			"FetchCandlestick"
		),
		makeEntry(
			response.orderBook,
			EnumEventMessage.fetchOrderBookSnapshot,
			"FetchOrderbook"
		),
		makeEntry(
			response.ticker24h,
			EnumEventMessage.fetch24hrTickerStats,
			"FetchTicker24hr"
		),
		makeEntry(
			response.bookTicker,
			EnumEventMessage.fetchOrderBookTickerSnapshot,
			"FetchBookTicker"
		),
		makeEntry(
			response.priceTicker,
			EnumEventMessage.fetchPriceTickerSnapshot,
			"FetchPriceTicker"
		),
		makeEntry(
			response.recentTrades,
			EnumEventMessage.fetchRecentTrades,
			"FetchRecentTrades"
		),
	];
}

export function sendMarketData({
	data,
	topic,
	eventType,
	builder,
}: MarketDataContext): void {
	builder.setTopic(topic).setEventType(eventType);
	MessageManager.post.indirect(data, builder.toJSON());
}

export function sendAllMarketData(
	entries: MarketDataEntry[],
	builder: typeof HELPER.metadataBuilder.prototype
): void {
	for (const entry of entries) {
		sendMarketData({
			data: entry.data,
			topic: entry.topic,
			eventType: entry.eventType,
			builder,
		});
	}
}
