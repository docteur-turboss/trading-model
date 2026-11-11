import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { toSymbol } from "@trading-model/primitives/primitives";

jest.mock("../../../../src/config/message-manager", () => ({
	MessageManager: {
		post: {
			indirect: jest.fn<(...args: any[]) => any>(),
		},
	},
}));

const MOCK_SET_DELIVERY = jest.fn<(...args: any[]) => any>().mockReturnThis();
const MOCK_METADATA_BUILDER_CTOR = jest
	.fn<(...args: any[]) => any>()
	.mockReturnValue({
		setDelivery: MOCK_SET_DELIVERY,
		setEventType: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		setTopic: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		setSecurity: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		setIds: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		setPublisher: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		toJSON: jest.fn<(...args: any[]) => any>().mockReturnValue({}),
	});

jest.mock("@trading-model/broker-message", () => ({
	HELPER: {
		metadataBuilder: MOCK_METADATA_BUILDER_CTOR,
	},
}));

jest.mock("../../../../src/infrastructure/config/env", () => ({
	ENV: {
		SERVICE_NAME: "financial-scraper",
		INSTANCE_ID: "test-instance-1",
	},
}));

import { BrokerMarketDataPublisher } from "../../../../src/adapters/outbound/broker/broker-market-data.publisher";
import { MessageManager } from "../../../../src/config/message-manager";
import type { MarketDataSnapshot } from "../../../../src/domain/market-data-snapshot";

const MOCK_MESSAGE_MANAGER_INDIRECT = jest.mocked(MessageManager.post.indirect);

const BTC = toSymbol("BTCUSDT");
const SNAPSHOT = {
	orderBook: { symbol: BTC },
	recentTrades: [{ tradeId: 1 }],
	candles: [{ symbol: BTC, closeTimestamp: 1 }],
	ticker24h: [{ symbol: BTC }],
	priceTicker: { BTCUSDT: 50000 },
	bookTicker: [{ symbol: BTC }],
	fetchedAt: 1,
} as unknown as MarketDataSnapshot;

describe("BrokerMarketDataPublisher", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_MESSAGE_MANAGER_INDIRECT.mockResolvedValue(undefined as never);
	});

	it("should publish the 6 market events of a snapshot", async () => {
		await new BrokerMarketDataPublisher().publish(SNAPSHOT);

		expect(MOCK_MESSAGE_MANAGER_INDIRECT).toHaveBeenCalledTimes(6);
		expect(MOCK_MESSAGE_MANAGER_INDIRECT).toHaveBeenCalledWith(
			{ candle: SNAPSHOT.candles },
			expect.anything()
		);
	});

	it("should resolve with the parts whose publish failed instead of rejecting", async () => {
		MOCK_MESSAGE_MANAGER_INDIRECT.mockRejectedValueOnce(
			new Error("message-manager unreachable")
		);

		await expect(
			new BrokerMarketDataPublisher().publish(SNAPSHOT)
		).resolves.toEqual(["candles"]);
		expect(MOCK_MESSAGE_MANAGER_INDIRECT).toHaveBeenCalledTimes(6);
	});

	it("should resolve with no part when every publish succeeds", async () => {
		await expect(
			new BrokerMarketDataPublisher().publish(SNAPSHOT)
		).resolves.toEqual([]);
	});

	it("should not publish the parts the source failed to fetch", async () => {
		const { orderBook: _orderBook, ...withoutOrderBook } = SNAPSHOT;

		await new BrokerMarketDataPublisher().publish(withoutOrderBook);

		expect(MOCK_MESSAGE_MANAGER_INDIRECT).toHaveBeenCalledTimes(5);
		expect(MOCK_MESSAGE_MANAGER_INDIRECT).not.toHaveBeenCalledWith(
			{ orderBook: expect.anything() },
			expect.anything()
		);
	});

	it("should build fresh metadata for each snapshot (not a shared singleton)", async () => {
		const publisher = new BrokerMarketDataPublisher();

		await publisher.publish(SNAPSHOT);
		await publisher.publish(SNAPSHOT);

		expect(MOCK_METADATA_BUILDER_CTOR).toHaveBeenCalledTimes(2);
	});

	it("should apply the configured delivery mode, at-least-once by default", async () => {
		await new BrokerMarketDataPublisher().publish(SNAPSHOT);
		await new BrokerMarketDataPublisher(DeliveryMode.AtMostOnce).publish(
			SNAPSHOT
		);

		expect(MOCK_SET_DELIVERY.mock.calls.map(([config]) => config.mode)).toEqual(
			[DeliveryMode.AtLeastOnce, DeliveryMode.AtMostOnce]
		);
	});
});
