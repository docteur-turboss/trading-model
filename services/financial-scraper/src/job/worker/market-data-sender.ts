import type { HELPER } from "@trading-model/broker-message";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import { toTopic } from "@trading-model/common/domain/primitives";
import { MarketEvent } from "@trading-model/validation/contracts/market-events";
import { MessageManager } from "../../config/message-manager";
import { type MarketDataEntry, makeEntry } from "./binance-worker-helpers";
import type { BinanceWorkerResult } from "./binance-worker-types";

export interface MarketDataContext extends MarketDataEntry {
	builder: typeof HELPER.metadataBuilder.prototype;
}

const MARKET_DATA_ENTRY_MAP: {
	key: keyof BinanceWorkerResult;
	event: MarketEvent;
	name: EventEnumMap;
}[] = [
	{
		key: "candles",
		event: MarketEvent.FetchCandlestickSeries,
		name: MarketEvent.FetchCandlestickSeries,
	},
	{
		key: "orderBook",
		event: MarketEvent.FetchOrderBookSnapshot,
		name: MarketEvent.FetchOrderBookSnapshot,
	},
	{
		key: "ticker24h",
		event: MarketEvent.Fetch24hrTickerStats,
		name: MarketEvent.Fetch24hrTickerStats,
	},
	{
		key: "bookTicker",
		event: MarketEvent.FetchOrderBookTickerSnapshot,
		name: MarketEvent.FetchOrderBookTickerSnapshot,
	},
	{
		key: "priceTicker",
		event: MarketEvent.FetchPriceTickerSnapshot,
		name: MarketEvent.FetchPriceTickerSnapshot,
	},
	{
		key: "recentTrades",
		event: MarketEvent.FetchRecentTrades,
		name: MarketEvent.FetchRecentTrades,
	},
];

export function buildMarketDataEntries(
	response: BinanceWorkerResult
): MarketDataEntry[] {
	return MARKET_DATA_ENTRY_MAP.map(({ key, event, name }) =>
		makeEntry(response[key], toTopic(event), name)
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
