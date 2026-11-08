import { describe, expect, it, jest } from "@jest/globals";

const MOCK_INDIRECT = jest.fn<(...args: unknown[]) => Promise<void>>();
const MOCK_CREATE = jest.fn((..._args: any[]) => ({
	messageManager: { post: { indirect: MOCK_INDIRECT } },
}));
const MOCK_WARN = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: MOCK_WARN,
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: { INSTANCE_ID: "dlq-service-1" },
}));

jest.mock("../../src/config/address-manager", () => ({
	AddressManager: {},
}));

jest.mock(
	"@trading-model/broker-message/application/services/create-message-manager",
	() => ({ createServiceMessageManager: MOCK_CREATE })
);

function load(): typeof import("../../src/config/audit") {
	return jest.requireActual("../../src/config/audit");
}

describe("publishDlqEvent", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it("publishes the event on its topic as dlq-service, at least once", () => {
		MOCK_INDIRECT.mockResolvedValue(undefined);

		load().publishDlqEvent(
			"dlq.entry.added" as never,
			{
				entryId: "e1",
				topic: "market.candlestick.series.fetch",
				reason: "TTL_EXPIRED",
			} as never
		);

		expect(MOCK_INDIRECT).toHaveBeenCalledWith(
			{
				entryId: "e1",
				topic: "market.candlestick.series.fetch",
				reason: "TTL_EXPIRED",
			},
			expect.objectContaining({
				topic: "dlq.entry.added",
				eventType: "dlq.entry.added",
				publisher: {
					serviceName: "dlq-service",
					instanceId: "dlq-service-1",
				},
				delivery: expect.objectContaining({ mode: "at-least-once" }),
			})
		);
	});

	it("builds the broker client once, on first use", () => {
		MOCK_INDIRECT.mockResolvedValue(undefined);
		const { publishDlqEvent } = load();
		expect(MOCK_CREATE).not.toHaveBeenCalled();

		publishDlqEvent("dlq.entry.added" as never, {} as never);
		publishDlqEvent("dlq.entry.added" as never, {} as never);

		expect(MOCK_CREATE).toHaveBeenCalledTimes(1);
	});

	it("logs a publish failure instead of throwing", async () => {
		MOCK_INDIRECT.mockRejectedValue(new Error("message-manager down"));

		expect(() =>
			load().publishDlqEvent("dlq.replay.completed" as never, {} as never)
		).not.toThrow();
		await new Promise((resolve) => setImmediate(resolve));

		expect(MOCK_WARN).toHaveBeenCalledWith(
			"DLQ event not published: the audit trail misses it",
			expect.objectContaining({ topic: "dlq.replay.completed" })
		);
	});
});
