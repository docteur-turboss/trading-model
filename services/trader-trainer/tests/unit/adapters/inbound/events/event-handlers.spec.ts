import { MarketEvent } from "@trading-model/contracts/market-events";
import { DataEventHandler } from "../../../../../src/adapters/inbound/events/event-handlers";
import { DataType } from "../../../../../src/domain/data-handlers/data-types";
import type { MarketDataBuffer } from "../../../../../src/domain/market-data-buffer";

function fakeBuffer() {
	const added: [DataType, string, unknown][] = [];
	const snapshots: unknown[] = [];
	const buffer = {
		addData: (t: DataType, s: string, d: unknown) => added.push([t, s, d]),
		setPriceSnapshot: (p: unknown) => snapshots.push(p),
	} as unknown as MarketDataBuffer;
	return { buffer, added, snapshots };
}

describe("DataEventHandler", () => {
	it.each([
		[MarketEvent.FetchCandlestickSeries, DataType.Candle, "candle"],
		[MarketEvent.FetchRecentTrades, DataType.Trade, "trades"],
		[
			MarketEvent.FetchOrderBookTickerSnapshot,
			DataType.BookTicker,
			"bookTicker",
		],
		[MarketEvent.Fetch24hrTickerStats, DataType.Ticker, "ticker"],
	] as const)("%s forwards each item to the buffer", (event, type, field) => {
		const { buffer, added } = fakeBuffer();
		const a = { symbol: "BTCUSDT" };
		const b = { symbol: "ETHUSDT" };
		new DataEventHandler(buffer).handleEvent(event, { [field]: [a, b] });
		expect(added).toEqual([
			[type, "BTCUSDT", a],
			[type, "ETHUSDT", b],
		]);
	});

	it("order book keeps the first item only", () => {
		const { buffer, added } = fakeBuffer();
		const a = { symbol: "BTCUSDT" };
		new DataEventHandler(buffer).handleEvent(
			MarketEvent.FetchOrderBookSnapshot,
			{ orderBook: [a, { symbol: "ETHUSDT" }] }
		);
		expect(added).toEqual([[DataType.OrderBook, "BTCUSDT", a]]);
	});

	it("price event sets the price snapshot", () => {
		const { buffer, snapshots } = fakeBuffer();
		const price = { BTCUSDT: 1 };
		new DataEventHandler(buffer).handleEvent(
			MarketEvent.FetchPriceTickerSnapshot,
			{ price }
		);
		expect(snapshots).toEqual([price]);
	});

	it.each([undefined, null, {}, { candle: [] }, { price: undefined }, "x"])(
		"ignores payload %p without calling the buffer",
		(payload) => {
			const { buffer, added, snapshots } = fakeBuffer();
			const h = new DataEventHandler(buffer);
			h.handleEvent(MarketEvent.FetchCandlestickSeries, payload);
			h.handleEvent(MarketEvent.FetchPriceTickerSnapshot, payload);
			expect(added).toEqual([]);
			expect(snapshots).toEqual([]);
		}
	);

	it("unknown data type is a no-op", () => {
		const { buffer, added } = fakeBuffer();
		new DataEventHandler(buffer).handle("nope" as DataType, {
			candle: [{ symbol: "A" }],
		});
		expect(added).toEqual([]);
	});

	it("propagates a buffer error", () => {
		const buffer = {
			addData: () => {
				throw new Error("boom");
			},
		} as unknown as MarketDataBuffer;
		expect(() =>
			new DataEventHandler(buffer).handleEvent(MarketEvent.FetchRecentTrades, {
				trades: [{ symbol: "A" }],
			})
		).toThrow("boom");
	});

	it("lists the six subscribed topics", () => {
		expect(
			new DataEventHandler(fakeBuffer().buffer).getSubscribedIntents()
		).toHaveLength(6);
	});
});
