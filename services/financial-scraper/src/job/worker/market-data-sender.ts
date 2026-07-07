import type { HELPER } from "@trading-model/broker-message";
import { EnumEventMessage } from "@trading-model/common/config/event.types";
import { MessageManager } from "../../config/message-manager";
import { type MarketDataEntry, makeEntry } from "./binance-worker-helpers";
import type { BinanceWorkerResult } from "./binance-worker-types";

export interface MarketDataContext extends MarketDataEntry {
	builder: typeof HELPER.metadataBuilder.prototype;
}

const MARKET_DATA_ENTRY_MAP: [
	keyof BinanceWorkerResult,
	EnumEventMessage,
	string,
][] = [
	["candles", EnumEventMessage.fetchCandlestickSeries, "FetchCandlestick"],
	["orderBook", EnumEventMessage.fetchOrderBookSnapshot, "FetchOrderbook"],
	["ticker24h", EnumEventMessage.fetch24hrTickerStats, "FetchTicker24hr"],
	[
		"bookTicker",
		EnumEventMessage.fetchOrderBookTickerSnapshot,
		"FetchBookTicker",
	],
	[
		"priceTicker",
		EnumEventMessage.fetchPriceTickerSnapshot,
		"FetchPriceTicker",
	],
	["recentTrades", EnumEventMessage.fetchRecentTrades, "FetchRecentTrades"],
];

export function buildMarketDataEntries(
	response: BinanceWorkerResult
): MarketDataEntry[] {
	return MARKET_DATA_ENTRY_MAP.map(([key, event, name]) =>
		makeEntry(response[key], event, name)
	);
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
