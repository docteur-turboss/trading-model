import { describe, expect, it, jest } from "@jest/globals";
import { MESSAGE_PAYLOAD_SCHEMA } from "@trading-model/broker-message/shared/barrel/message.schema";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { MarketEvent } from "@trading-model/contracts/market-events";
import { toJsonWire } from "@trading-model/http/infrastructure/json-wire";
import { toSymbol } from "@trading-model/primitives/primitives";
import {
	mock24hrTickerResponse,
	mockBookTickerResponse,
	mockCandlestickResponse,
	mockDepthResponse,
	mockPriceTickerResponse,
	mockTradeResponse,
} from "../../../fixtures/binance.fixture";

jest.mock("../../../../src/infrastructure/config/env", () => ({
	ENV: {
		SERVICE_NAME: "financial-scraper-service",
		INSTANCE_ID: "financial-scraper-1",
		BINANCE_BASE_URL: "https://api.binance.com",
	},
}));

jest.mock("../../../../src/config/message-manager", () => ({
	MessageManager: { post: { indirect: jest.fn<(...args: any[]) => any>() } },
}));

import { buildResponse } from "../../../../src/adapters/outbound/binance/binance-data-fetcher";
import { buildMarketDataEntries } from "../../../../src/adapters/outbound/broker/market-data-sender";

/** Same conversions as the HttpClient request body (bigint → string, Set → array). */
function overTheWire(data: unknown): unknown {
	return JSON.parse(JSON.stringify(data, toJsonWire));
}

// Publisher and subscriber used to be tested apart, each against its own idea
// of the payload: the scraper sent bare arrays the subscribers rejected. This
// checks the real normalizer output against the real subscriber validators.
describe("published market data contract", () => {
	const response = buildResponse(
		{ symbol: toSymbol("BTCUSDT"), interval: CandleInterval.Min1 },
		{
			orderBookRaw: mockDepthResponse,
			tradesRaw: mockTradeResponse,
			candlesRaw: mockCandlestickResponse,
			ticker24hRaw: mock24hrTickerResponse,
			priceTickerRaw: mockPriceTickerResponse,
			bookTickerRaw: mockBookTickerResponse,
		}
	);
	const entries = buildMarketDataEntries(response);

	it.each(entries.map((entry) => [String(entry.topic), entry] as const))(
		"%s passes the subscriber payload validation",
		(_topic, entry) => {
			const result = MESSAGE_PAYLOAD_SCHEMA.safeParse({
				type: entry.topic,
				data: overTheWire(entry.data),
			});

			expect(result.error?.issues ?? []).toEqual([]);
		}
	);

	it("publishes the candles in the { candle } envelope the trainer reads", () => {
		const candles = entries.find(
			(entry) => entry.topic === MarketEvent.FetchCandlestickSeries
		);

		expect(overTheWire(candles?.data)).toMatchObject({
			candle: [expect.objectContaining({ symbol: "BTCUSDT" })],
		});
	});

	it("loses only the part a payload cannot be normalized, not the symbol", () => {
		const snapshot = buildResponse(
			{ symbol: toSymbol("BTCUSDT"), interval: CandleInterval.Min1 },
			{
				candlesRaw: [{ ...mockCandlestickResponse[0], open: "-1" as never }],
				priceTickerRaw: mockPriceTickerResponse,
			}
		);

		expect(snapshot.candles).toBeUndefined();
		expect(snapshot.priceTicker).toEqual({ BTCUSDT: 50000 });
	});
});
