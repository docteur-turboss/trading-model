import { describe, expect, it } from "@jest/globals";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { DataType } from "../../../src/domain/data-handlers/data-types";
import { MarketDataBuffer } from "../../../src/domain/market-data-buffer";
import type { SymbolState } from "../../../src/domain/market-data-types";
import { validateTrainingPrerequisites } from "../../../src/domain/training-prerequisite-validator";
import { feedCandles, makeCandle } from "../../fixtures/market-data.fixture";

const BTC = TradingSymbol.of("BTCUSDT");
const WINDOWING = {
	validationSplit: 0.2,
	testSplit: 0.15,
	walkForwardFolds: 1,
};
const notTraining = () => false;

describe("validateTrainingPrerequisites", () => {
	it("should build the windows from a strictly increasing candle series", () => {
		const buffer = new MarketDataBuffer();
		feedCandles(buffer, "BTCUSDT", 100);

		const result = validateTrainingPrerequisites(
			buffer,
			notTraining,
			BTC,
			WINDOWING
		);

		expect(result.ok).toBe(true);
	});

	it("should refuse a series holding the same candle twice", () => {
		const buffer = new MarketDataBuffer();
		feedCandles(buffer, "BTCUSDT", 100);
		const state = buffer.getSymbolState(BTC) as SymbolState;
		// Restored state bypasses the ingestion dedup.
		buffer.restoreSymbolState(BTC, {
			...state,
			candles: [...state.candles, state.candles[state.candles.length - 1]],
		});

		const result = validateTrainingPrerequisites(
			buffer,
			notTraining,
			BTC,
			WINDOWING
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.error.message).toContain(
				"duplicated or out-of-order timestamps"
			);
		}
	});

	it("should refuse while a training is already running", () => {
		const buffer = new MarketDataBuffer();
		buffer.addData(
			DataType.Candle,
			BTC,
			makeCandle({
				symbol: BTC,
				close: Price.of(1),
				timestamp: UnixTimestamp.of(1),
			})
		);

		const result = validateTrainingPrerequisites(
			buffer,
			() => true,
			BTC,
			WINDOWING
		);

		expect(result.ok).toBe(false);
	});
});
