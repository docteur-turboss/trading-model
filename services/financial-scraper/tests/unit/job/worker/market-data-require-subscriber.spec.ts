import { describe, expect, it, jest } from "@jest/globals";
import { MarketEvent } from "@trading-model/contracts/market-events";
import { toTopic } from "@trading-model/primitives/primitives";

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

jest.mock("../../../../src/config/metrics", () => ({
	EVENTS_PUBLISHED_TOTAL: { inc: jest.fn<(...args: any[]) => any>() },
}));

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		error: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		info: jest.fn<(...args: any[]) => any>(),
	},
}));

import { sendAllMarketData } from "../../../../src/adapters/outbound/broker/market-data-sender";
import { createMarketDataMetadata } from "../../../../src/adapters/outbound/broker/metadata-builder";
import { MessageManager } from "../../../../src/config/message-manager";

const indirect = MessageManager.post.indirect as unknown as jest.Mock<
	(
		data: unknown,
		metadata: { delivery?: { requireSubscriber?: boolean } }
	) => Promise<void>
>;

function entry(event: MarketEvent, part: "candles" | "orderBook") {
	return { data: {}, topic: toTopic(event), eventType: event, part };
}

// Candles follow the publish cursor: message-manager must refuse them, not
// drop them, while their topic has no subscriber (after its own outage).
describe("sendAllMarketData — requireSubscriber", () => {
	it("asks message-manager to refuse unrouted candles, and only candles", async () => {
		indirect.mockResolvedValue(undefined);

		const failed = await sendAllMarketData(
			[
				entry(MarketEvent.FetchCandlestickSeries, "candles"),
				entry(MarketEvent.FetchOrderBookSnapshot, "orderBook"),
			],
			createMarketDataMetadata()
		);

		expect(failed).toEqual([]);
		const byTopic = new Map(
			indirect.mock.calls.map(([, metadata]) => [
				(metadata as { topic: string }).topic,
				metadata.delivery,
			])
		);
		expect(byTopic.get(MarketEvent.FetchCandlestickSeries)).toMatchObject({
			requireSubscriber: true,
		});
		expect(
			byTopic.get(MarketEvent.FetchOrderBookSnapshot)?.requireSubscriber
		).toBeUndefined();
	});

	it("reports the candles as failed when message-manager refuses them", async () => {
		indirect.mockReset();
		indirect.mockRejectedValueOnce(new Error("No subscriber"));

		const failed = await sendAllMarketData(
			[entry(MarketEvent.FetchCandlestickSeries, "candles")],
			createMarketDataMetadata()
		);

		expect(failed).toEqual(["candles"]);
	});
});
