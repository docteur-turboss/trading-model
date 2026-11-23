import { FEATURE_LAYOUT } from "@trading-model/model-runtime/feature-vector-codec";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import { MarketDataBuffer } from "../../../src/domain/market-data-buffer";
import { makeCandle } from "../../fixtures/market-data.fixture";

// ADR-0030: a candle's features read only what was known at its close.
// ADR-0078: the candle window is their only source.
const SYMBOL = TradingSymbol.of("BTCUSDT");
const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

/** Close time of candle `idx` (candle 0 opens at T0). */
const closeOf = (idx: number) => T0 + (idx + 1) * MINUTE - 1;

function candle(idx: number) {
	const price = 100 + 10 * Math.sin(idx) + idx;
	return makeCandle({
		symbol: SYMBOL,
		timestamp: UnixTimestamp.of(T0 + idx * MINUTE),
		closeTimestamp: UnixTimestamp.of(closeOf(idx)),
		open: Price.of(price - 1),
		high: Price.of(price + 2),
		low: Price.of(price - 2),
		close: Price.of(price),
		volume: Volume.of(1000 + 37 * idx),
	});
}

function bufferWith(candles: number): MarketDataBuffer {
	const buffer = new MarketDataBuffer();
	for (let idx = 0; idx < candles; idx++) {
		buffer.addCandle(SYMBOL, candle(idx));
	}
	return buffer;
}

const features = (buffer: MarketDataBuffer) =>
	buffer
		.buildMarketSteps(SYMBOL)
		.map((step) => Array.from(step.features.toFloat32Array()));

describe("point-in-time features (ADR-0030, ADR-0078)", () => {
	it("leaves every past step unchanged when later data arrives", () => {
		const past = features(bufferWith(20));
		const later = features(bufferWith(40)).slice(0, past.length);

		expect(later).toEqual(past);
	});

	it("gives every bar of the window the same candle-only features", () => {
		const steps = features(bufferWith(30));

		expect(FEATURE_LAYOUT.fields.some((f) => /Book|Trade|Ticker/.test(f))).toBe(
			false
		);
		expect(new Set(steps.map((s) => s.length))).toEqual(
			new Set([FEATURE_LAYOUT.dim])
		);
	});

	it("builds the same steps in a fresh pod and in one that reloaded the window", () => {
		const reloaded = bufferWith(10);
		const window = Array.from({ length: 30 }, (_, idx) => candle(idx));
		reloaded.replaceCandles(SYMBOL, window);

		expect(features(reloaded)).toEqual(features(bufferWith(30)));
	});
});
