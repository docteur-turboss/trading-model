import { describe, expect, it } from "@jest/globals";
import { DlqEvent, isDlqEventTopic } from "../../src/dlq-events";

describe("DlqEvent", () => {
	it("names the dead-letter domain events", () => {
		expect(Object.values(DlqEvent)).toEqual([
			"dlq.entry.added",
			"dlq.replay.completed",
			"dlq.entries.deleted",
		]);
	});

	it("tells DLQ event topics apart from the others", () => {
		expect(isDlqEventTopic(DlqEvent.EntryAdded)).toBe(true);
		expect(isDlqEventTopic("market.candlestick.series.fetch")).toBe(false);
		expect(isDlqEventTopic(null)).toBe(false);
		expect(isDlqEventTopic(undefined)).toBe(false);
	});
});
