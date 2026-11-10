import { describe, expect, it, jest } from "@jest/globals";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { MarketEvent } from "@trading-model/contracts/market-events";

jest.mock("../../../../src/infrastructure/config/env", () => ({
	ENV: {
		SERVICE_NAME: "financial-scraper",
		INSTANCE_ID: "financial-scraper-1",
	},
}));

import { createMarketDataMetadata } from "../../../../src/adapters/outbound/broker/metadata-builder";

// Runs against the real broker-message builder: a mocked HELPER hid that the
// worker constructed it without the topic/eventType/publisher it validates,
// so every scrape cycle threw before reaching Binance.
describe("createMarketDataMetadata", () => {
	it("builds valid message metadata with the real broker-message builder", () => {
		const metadata = createMarketDataMetadata(
			DeliveryMode.AtLeastOnce
		).toJSON();

		expect(metadata).toMatchObject({
			topic: MarketEvent.FetchCandlestickSeries,
			eventType: MarketEvent.FetchCandlestickSeries,
			publisher: {
				serviceName: "financial-scraper",
				instanceId: "financial-scraper-1",
			},
		});
	});

	it("lets each market data message override topic and event type", () => {
		const builder = createMarketDataMetadata();

		const metadata = builder
			.setTopic(MarketEvent.FetchRecentTrades as never)
			.setEventType(MarketEvent.FetchRecentTrades)
			.toJSON();

		expect(metadata).toMatchObject({
			topic: MarketEvent.FetchRecentTrades,
			eventType: MarketEvent.FetchRecentTrades,
		});
	});
});
