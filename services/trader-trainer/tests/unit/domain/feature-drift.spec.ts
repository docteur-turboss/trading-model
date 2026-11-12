import { describe, expect, it } from "@jest/globals";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { featureDriftScore } from "../../../src/domain/feature-drift";
import { buyAndHoldSharpe } from "../../../src/domain/genetic-algorithm/evaluation-utils";
import type { BaseSymbolState } from "../../../src/domain/market-data-types";
import { makeCandle } from "../../fixtures/market-data.fixture";

/** Model statistics of `close`: mean 100, std 2 (m2 8 over 3 values). */
const MODEL_NORM = { candle: { close: { count: 3, mean: 100, m2: 8 } } };

function stateWithCloses(closes: number[], timestamp = 1000): BaseSymbolState {
	return {
		candles: closes.map((close) =>
			makeCandle({
				symbol: TradingSymbol.of("BTCUSDT"),
				close: Price.of(close),
				timestamp: UnixTimestamp.of(timestamp),
			})
		),
		trades: [],
		orderBooks: [],
		bookTickers: [],
		tickers24h: [],
		prices: [],
	};
}

describe("featureDriftScore", () => {
	it("is 0 when the live stream follows the model statistics", () => {
		expect(
			featureDriftScore(stateWithCloses([98, 100, 102]), MODEL_NORM, 0)
		).toBe(0);
	});

	it("is the live mean shift in model standard deviations", () => {
		expect(featureDriftScore(stateWithCloses([104, 108]), MODEL_NORM, 0)).toBe(
			3
		);
	});

	it("only reads the data received since the model", () => {
		const state = stateWithCloses([500], 10);
		state.candles.push(...stateWithCloses([102], 2000).candles);
		expect(featureDriftScore(state, MODEL_NORM, 1000)).toBe(1);
	});

	it("is undefined without live data since the model or without model std", () => {
		expect(
			featureDriftScore(stateWithCloses([104]), MODEL_NORM, 5000)
		).toBeUndefined();
		const flat = { candle: { close: { count: 3, mean: 100, m2: 0 } } };
		expect(featureDriftScore(stateWithCloses([104]), flat, 0)).toBeUndefined();
	});
});

describe("buyAndHoldSharpe", () => {
	const steps = (prices: number[]) =>
		prices.map((price) => ({ price: Price.of(price), features: [] as never }));

	it("is the Sharpe of the one-unit price changes over the bars", () => {
		// Changes 1, 2, 1: mean 4/3, std sqrt(1/3); no timestamps, per bar.
		const sharpe = buyAndHoldSharpe([steps([1, 2, 4, 5])]);
		expect(sharpe).toBeCloseTo(4 / 3 / Math.sqrt(1 / 3), 10);
	});

	it("annualises with the bar spacing", () => {
		const hourly = steps([1, 2, 4, 5]).map((step, idx) => ({
			...step,
			timestamp: idx * 3_600_000,
		}));
		const sharpe = buyAndHoldSharpe([hourly]);
		expect(sharpe).toBeCloseTo(
			(4 / 3 / Math.sqrt(1 / 3)) * Math.sqrt(365.25 * 24),
			6
		);
	});
});
