import type { HELPER } from "@trading-model/broker-message";
import { normalizeError } from "@trading-model/common/utils/errors";
import {
	MarketEvent,
	type MarketEventMap,
} from "@trading-model/contracts/market-events";
import { logger } from "@trading-model/http/infrastructure/logger";
import { toTopic } from "@trading-model/primitives/primitives";
import { MessageManager } from "../../../config/message-manager";
import { EVENTS_PUBLISHED_TOTAL } from "../../../config/metrics";
import type {
	MarketDataSnapshot,
	SnapshotPart,
} from "../../../domain/market-data-snapshot";
import { type MarketDataEntry, makeEntry } from "./message-builder";

/** One event to publish, with the snapshot part it carries. */
export interface MarketDataPartEntry extends MarketDataEntry {
	part: SnapshotPart;
}

interface MarketDataContext extends MarketDataEntry {
	builder: typeof HELPER.metadataBuilder.prototype;
}

/**
 * Payload of each published event, in the MarketEventMap envelope the
 * subscribers validate and read (`{ candle: [...] }`, `{ orderBook: [...] }`...).
 */
const MARKET_DATA_ENTRY_MAP: {
	part: SnapshotPart;
	event: MarketEvent & keyof MarketEventMap;
	toPayload: (response: MarketDataSnapshot) => unknown;
}[] = [
	{
		part: "candles",
		event: MarketEvent.FetchCandlestickSeries,
		toPayload: (response) => ({ candle: response.candles }),
	},
	{
		part: "orderBook",
		event: MarketEvent.FetchOrderBookSnapshot,
		toPayload: (response) => ({ orderBook: [response.orderBook] }),
	},
	{
		part: "ticker24h",
		event: MarketEvent.Fetch24hrTickerStats,
		toPayload: (response) => ({ ticker: response.ticker24h }),
	},
	{
		part: "bookTicker",
		event: MarketEvent.FetchOrderBookTickerSnapshot,
		toPayload: (response) => ({ bookTicker: response.bookTicker }),
	},
	{
		part: "priceTicker",
		event: MarketEvent.FetchPriceTickerSnapshot,
		toPayload: (response) => ({ price: response.priceTicker }),
	},
	{
		part: "recentTrades",
		event: MarketEvent.FetchRecentTrades,
		toPayload: (response) => ({ trades: response.recentTrades }),
	},
];

/** The events of a snapshot, one per part it holds (a part not fetched is not sent). */
export function buildMarketDataEntries(
	response: MarketDataSnapshot
): MarketDataPartEntry[] {
	return MARKET_DATA_ENTRY_MAP.filter(
		({ part }) => response[part] !== undefined
	).map(({ part, event, toPayload }) => ({
		...makeEntry(toPayload(response), toTopic(event), event),
		part,
	}));
}

async function sendMarketData({
	data,
	topic,
	eventType,
	builder,
}: MarketDataContext): Promise<void> {
	// The builder is shared: snapshot the metadata before the next entry mutates it.
	const metadata = builder.setTopic(topic).setEventType(eventType).toJSON();
	await MessageManager.post.indirect(data, metadata);
	EVENTS_PUBLISHED_TOTAL.inc({ event_type: String(eventType) });
}

/**
 * Publishes every market data entry. A failed publish is logged, never thrown
 * (it must not crash the process with an unhandled rejection): the parts that
 * failed are returned so the caller can send them again.
 */
export async function sendAllMarketData(
	entries: MarketDataPartEntry[],
	builder: typeof HELPER.metadataBuilder.prototype
): Promise<SnapshotPart[]> {
	const results = await Promise.allSettled(
		entries.map((entry) => sendMarketData({ ...entry, builder }))
	);
	const failed: SnapshotPart[] = [];
	results.forEach((result, index) => {
		const entry = entries[index] as MarketDataPartEntry;
		if (result.status === "rejected") {
			failed.push(entry.part);
			logger.error("Market data publish failed", {
				context: { topic: String(entry.topic) },
				error: normalizeError(result.reason),
			});
		}
	});
	return failed;
}
