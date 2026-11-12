import { MarketEvent } from "@trading-model/contracts/market-events";
import { TrainingEvent } from "@trading-model/contracts/training-events";
import { auditedTopics } from "../../../src/config/audited-topics";

describe("auditedTopics", () => {
	it("does not subscribe to market data (kept in MySQL, ADR-0027)", () => {
		const topics: string[] = auditedTopics();
		for (const t of Object.values(MarketEvent)) {
			expect(topics).not.toContain(t);
		}
		expect(topics).toContain(TrainingEvent.ModelPublished);
	});
});
