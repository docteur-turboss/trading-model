import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import {
	PositiveInt,
	toTopic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { DlqEntryWire } from "../../src/wire/dlq-entry";

/** What message-manager appends to its dead-letter file (http-message-delivery.ts). */
function deadLetterFromMessageManager(): DlqEntry {
	return {
		message: { metadata: { topic: "market.candles" }, payload: { close: 1 } },
		reason: "MAX_RETRIES_EXCEEDED",
		deliveryAttempt: PositiveInt.of(10),
		timestamp: UnixTimestamp.of(1_761_609_600_000),
	};
}

describe("DlqEntryWire", () => {
	it("accepts a dead letter written by message-manager, round-tripped through JSON", () => {
		const entry = deadLetterFromMessageManager();

		const parsed = DlqEntryWire.parse(JSON.parse(JSON.stringify(entry)));

		expect(parsed).toEqual(entry);
	});

	it("keeps topic and messageId", () => {
		const parsed = DlqEntryWire.parse({
			topic: "market.candles",
			messageId: "m-1",
			message: "x",
			deliveryAttempt: 1,
			timestamp: 0,
		});

		expect(parsed.topic).toBe(toTopic("market.candles"));
		expect(parsed.messageId).toBe("m-1");
	});

	it("drops an id sent by the client: dlq-service assigns it", () => {
		const parsed = DlqEntryWire.parse({
			id: "client-chosen",
			message: "x",
			deliveryAttempt: 1,
			timestamp: 0,
		});

		expect(parsed).not.toHaveProperty("id");
	});

	describe("legacy timestamps", () => {
		it("converts an epoch-milliseconds string", () => {
			const parsed = DlqEntryWire.parse({
				message: "x",
				deliveryAttempt: 1,
				timestamp: "1761609600000",
			});

			expect(parsed.timestamp).toBe(1_761_609_600_000);
		});

		it("converts an ISO date", () => {
			const parsed = DlqEntryWire.parse({
				message: "x",
				deliveryAttempt: 1,
				timestamp: "2025-10-28T00:00:00.000Z",
			});

			expect(parsed.timestamp).toBe(Date.parse("2025-10-28T00:00:00.000Z"));
		});

		it("converts an ISO date with an offset", () => {
			const parsed = DlqEntryWire.parse({
				message: "x",
				deliveryAttempt: 1,
				timestamp: "2025-10-28T02:00:00+02:00",
			});

			expect(parsed.timestamp).toBe(Date.parse("2025-10-28T00:00:00.000Z"));
		});
	});

	it.each([
		["a non-date string", { timestamp: "yesterday" }],
		["a date before 1970", { timestamp: "1960-01-01T00:00:00Z" }],
		["a negative timestamp", { timestamp: -1 }],
		["a fractional timestamp", { timestamp: 1.5 }],
		["deliveryAttempt 0", { deliveryAttempt: 0 }],
		["a non-numeric deliveryAttempt", { deliveryAttempt: "3" }],
		["an empty topic", { topic: "" }],
		["an empty messageId", { messageId: "" }],
	])("rejects %s", (_label, override) => {
		const result = DlqEntryWire.safeParse({
			message: "x",
			deliveryAttempt: 1,
			timestamp: 0,
			...override,
		});

		expect(result.success).toBe(false);
	});

	it("rejects an entry without message, deliveryAttempt or timestamp", () => {
		expect(DlqEntryWire.safeParse({}).success).toBe(false);
	});
});
