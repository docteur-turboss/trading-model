import { describe, expect, it } from "@jest/globals";
import { MarketEvent } from "../../../src/contracts/market-events";

describe("MarketEvent", () => {
	it("should have correct values", () => {
		expect(MarketEvent.TestEvent).toBe("example.debug.create");
		expect(MarketEvent.ExampleEvent).toBe("example.show.create");
		expect(MarketEvent.FetchRecentTrades).toBe("market.trade.recent.fetch");
		expect(MarketEvent.Fetch24hrTickerStats).toBe(
			"market.ticker.24hr-stats.fetch"
		);
		expect(MarketEvent.FetchCandlestickSeries).toBe(
			"market.candlestick.series.fetch"
		);
		expect(MarketEvent.FetchOrderBookSnapshot).toBe(
			"market.order-book.snapshot.fetch"
		);
		expect(MarketEvent.FetchPriceTickerSnapshot).toBe(
			"market.price-ticker.snapshot.fetch"
		);
		expect(MarketEvent.FetchOrderBookTickerSnapshot).toBe(
			"market.order-book-ticker.snapshot.fetch"
		);
	});
});
