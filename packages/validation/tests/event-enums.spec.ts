import { AuditEvent } from "../src/contracts/audit-events";
import { CertificateEvent } from "../src/contracts/certificate-events";
import { DiscoveryWsMessageType } from "../src/contracts/discovery-ws-message.types";
import { MarketEvent } from "../src/contracts/market-events";

describe("AuditEvent", () => {
	it("has expected values", () => {
		expect(AuditEvent.AuditHeartbeat).toBe("audit.heartbeat");
		expect(AuditEvent.AuditGapDetected).toBe("audit.gap.detected");
	});
});

describe("CertificateEvent", () => {
	it("has expected values", () => {
		expect(CertificateEvent.CertificateRevoked).toBe("ca.certificate.revoked");
		expect(CertificateEvent.CaKeyRotated).toBe("ca.key.rotated");
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

describe("DiscoveryWsMessageType", () => {
	it("has expected values", () => {
		expect(DiscoveryWsMessageType.Heartbeat).toBe("heartbeat");
		expect(DiscoveryWsMessageType.Register).toBe("register");
		expect(DiscoveryWsMessageType.Subscribe).toBe("subscribe");
		expect(DiscoveryWsMessageType.CacheInvalidate).toBe("cache.invalidate");
	});
});
