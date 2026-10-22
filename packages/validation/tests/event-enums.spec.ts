import { AuditEvent } from "../src/domain/contracts/audit-events";
import { MarketEvent } from "../src/domain/contracts/market-events";

describe("AuditEvent", () => {
	it("has expected values", () => {
		expect(AuditEvent.AuditHeartbeat).toBe("audit.heartbeat");
		expect(AuditEvent.AuditGapDetected).toBe("audit.gap.detected");
	});
});

describe("MarketEvent", () => {
	it("has expected values", () => {
		expect(MarketEvent.TestEvent).toBe("example.debug.create");
		expect(MarketEvent.FetchRecentTrades).toBe("market.trade.recent.fetch");
		expect(MarketEvent.Fetch24hrTickerStats).toBe(
			"market.ticker.24hr-stats.fetch"
		);
	});
});
