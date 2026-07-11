import { describe, expect, it } from "@jest/globals";
import {
	BaseMarketDataShape,
	BidAskShape,
	OhlcvShape,
	OhlcvTickerShape,
} from "../../../src/domain/market-data-schema";

describe("market-data-schema", () => {
	it("should export BaseMarketDataShape", () => {
		expect(BaseMarketDataShape.symbol).toBeDefined();
		expect(BaseMarketDataShape.timestamp).toBeDefined();
		expect(BaseMarketDataShape.source).toBeDefined();
		expect(BaseMarketDataShape.market).toBeDefined();
	});

	it("should export OhlcvShape", () => {
		expect(OhlcvShape.low).toBeDefined();
		expect(OhlcvShape.open).toBeDefined();
		expect(OhlcvShape.high).toBeDefined();
		expect(OhlcvShape.close).toBeDefined();
		expect(OhlcvShape.volume).toBeDefined();
	});

	it("should export OhlcvTickerShape", () => {
		expect(OhlcvTickerShape.low).toBeDefined();
		expect(OhlcvTickerShape.open).toBeDefined();
		expect(OhlcvTickerShape.high).toBeDefined();
		expect(OhlcvTickerShape.last).toBeDefined();
		expect(OhlcvTickerShape.volume).toBeDefined();
	});

	it("should export BidAskShape", () => {
		expect(BidAskShape.bid).toBeDefined();
		expect(BidAskShape.ask).toBeDefined();
		expect(BidAskShape.bidQty).toBeDefined();
		expect(BidAskShape.askQty).toBeDefined();
	});
});
