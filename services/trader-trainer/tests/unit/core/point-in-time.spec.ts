import { TradeSide } from "@trading-model/contracts/market-data.types";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import { DataType } from "../../../src/domain/data-handlers/data-types";
import { MarketDataBuffer } from "../../../src/domain/market-data-buffer";
import {
	makeBookTicker,
	makeCandle,
	makeOrderBook,
	makeTicker24h,
	makeTrade,
} from "../../fixtures/market-data.fixture";

// ADR-0030: a candle's features read only what was known at its close.
const SYMBOL = TradingSymbol.of("BTCUSDT");
/** Feature indices (FEATURE_LAYOUT). */
const FeatureIndex = {
	OrderBookAvgBid: 9,
	OrderBookSpreadRatio: 11,
	BookTickerBid: 13,
	TradeBuyRatio: 18,
	TickerPriceChange: 19,
};
const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

/** Close time of candle `idx` (candle 0 opens at T0). */
const closeOf = (idx: number) => T0 + (idx + 1) * MINUTE - 1;

function addCandle(buffer: MarketDataBuffer, idx: number): void {
	const price = 100 + 10 * Math.sin(idx) + idx;
	buffer.addData(
		DataType.Candle,
		SYMBOL,
		makeCandle({
			symbol: SYMBOL,
			timestamp: UnixTimestamp.of(T0 + idx * MINUTE),
			closeTimestamp: UnixTimestamp.of(closeOf(idx)),
			open: Price.of(price - 1),
			high: Price.of(price + 2),
			low: Price.of(price - 2),
			close: Price.of(price),
			volume: Volume.of(1000 + 37 * idx),
		})
	);
}

/** What the scraper sends with candle `idx`: received just after its close. */
function addSnapshots(buffer: MarketDataBuffer, idx: number): void {
	const at = closeOf(idx) + 50;
	buffer.addData(DataType.OrderBook, SYMBOL, {
		...makeOrderBook("BTCUSDT"),
		timestamp: UnixTimestamp.of(at),
		bids: new Set([{ price: Price.of(90 + idx), quantity: Volume.of(5) }]),
		asks: new Set([{ price: Price.of(95 + idx), quantity: Volume.of(3) }]),
	});
	buffer.addData(DataType.BookTicker, SYMBOL, {
		...makeBookTicker("BTCUSDT"),
		timestamp: UnixTimestamp.of(at),
		bid: Price.of(91 + idx),
		ask: Price.of(92 + 2 * idx),
	});
	buffer.addData(DataType.Ticker, SYMBOL, {
		...makeTicker24h("BTCUSDT"),
		timestamp: UnixTimestamp.of(at - 86_400_000),
		closeTimestamp: UnixTimestamp.of(at),
		last: Price.of(100 + idx),
		volume: Volume.of(5000 + idx),
	});
	buffer.addData(DataType.Trade, SYMBOL, {
		...makeTrade("BTCUSDT", idx % 2 ? TradeSide.Buy : TradeSide.Sell),
		timestamp: UnixTimestamp.of(at - 1000),
		tradeId: BigInt(idx + 1),
		price: Price.of(100 + idx),
	});
	buffer.setPriceSnapshot({ [SYMBOL]: Price.of(200 + idx) }, at);
}

function bufferWith(candles: number): MarketDataBuffer {
	const buffer = new MarketDataBuffer();
	for (let idx = 0; idx < candles; idx++) {
		addCandle(buffer, idx);
		addSnapshots(buffer, idx);
	}
	return buffer;
}

const features = (buffer: MarketDataBuffer) =>
	buffer
		.buildMarketSteps(SYMBOL)
		.map((step) => Array.from(step.features.toFloat32Array()));

describe("point-in-time features (ADR-0030)", () => {
	it("leaves every past step unchanged when later data arrives", () => {
		const past = features(bufferWith(20));
		const later = features(bufferWith(40)).slice(0, past.length);

		expect(later).toEqual(past);
	});

	it("does not show a candle the snapshots received after its close", () => {
		const buffer = new MarketDataBuffer();
		addCandle(buffer, 0);
		addCandle(buffer, 1);
		addSnapshots(buffer, 1); // received after candle 1 closed

		const [step] = features(buffer);

		// Its trade happened before the close: trades carry their own time.
		expect(step[FeatureIndex.TradeBuyRatio]).toBe(1);
		for (const idx of [
			FeatureIndex.OrderBookAvgBid,
			FeatureIndex.BookTickerBid,
			FeatureIndex.TickerPriceChange,
		]) {
			expect(step[idx]).toBe(0);
		}
	});

	it("shows the snapshots received before the close", () => {
		const buffer = new MarketDataBuffer();
		addCandle(buffer, 0);
		addSnapshots(buffer, 0);
		addCandle(buffer, 1);

		const [step] = features(buffer);

		// Order book of candle 0: bids at 90, asks at 95.
		expect(step[FeatureIndex.OrderBookSpreadRatio]).toBeCloseTo(5 / 95, 5);
		expect(step[FeatureIndex.TradeBuyRatio]).toBe(0); // one sell trade
		expect(step[FeatureIndex.TickerPriceChange]).toBeCloseTo(0, 5);
	});

	it("uses the price ticker known at the close, not the latest one", () => {
		const buffer = bufferWith(3);
		const before = features(buffer);
		buffer.setPriceSnapshot({ [SYMBOL]: Price.of(1_000_000) }, closeOf(5));

		expect(features(buffer)).toEqual(before);
	});

	it("keeps trades of the last minute before the close only", () => {
		const buffer = new MarketDataBuffer();
		addCandle(buffer, 0);
		addCandle(buffer, 5);
		const trade = (at: number, id: number, side: TradeSide) =>
			buffer.addData(DataType.Trade, SYMBOL, {
				...makeTrade("BTCUSDT", side),
				timestamp: UnixTimestamp.of(at),
				tradeId: BigInt(id),
			});
		trade(closeOf(5) - 2 * MINUTE, 1, TradeSide.Sell); // too old
		trade(closeOf(5) - 1000, 2, TradeSide.Buy);
		trade(closeOf(5) + 1000, 3, TradeSide.Sell); // after the close

		const [step] = features(buffer);

		expect(step[FeatureIndex.TradeBuyRatio]).toBe(1);
	});

	it("counts a trade received twice once", () => {
		const buffer = new MarketDataBuffer();
		const trade = { ...makeTrade("BTCUSDT"), tradeId: BigInt(7) };
		buffer.addData(DataType.Candle, SYMBOL, makeCandle({ symbol: SYMBOL }));
		buffer.addData(DataType.Trade, SYMBOL, trade);
		buffer.addData(DataType.Trade, SYMBOL, trade);

		expect(buffer.getSymbolState(SYMBOL)?.trades).toHaveLength(1);
		expect(buffer.snapshotNormalization(SYMBOL)).toMatchObject({
			trade: { qty: { count: 1 } },
		});
	});
});
