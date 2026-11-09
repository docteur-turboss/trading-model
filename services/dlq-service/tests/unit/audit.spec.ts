import { describe, expect, it, jest } from "@jest/globals";

const MOCK_INDIRECT = jest.fn<(...args: unknown[]) => Promise<void>>();
const MOCK_CREATE = jest.fn((..._args: any[]) => ({
	messageManager: { post: { indirect: MOCK_INDIRECT } },
}));
const MOCK_ERROR = jest.fn<(...args: any[]) => any>();
const MOCK_FAILURES = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: MOCK_ERROR,
	},
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: { INSTANCE_ID: "dlq-service-1" },
}));

jest.mock("../../src/config/metrics", () => ({
	metrics: { auditPublishFailures: { inc: MOCK_FAILURES } },
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

	it("resolves true once message-manager accepted the event", async () => {
		MOCK_INDIRECT.mockResolvedValue(undefined);

		await expect(
			load().publishDlqEvent("dlq.entries.deleted" as never, {} as never)
		).resolves.toBe(true);
		expect(MOCK_FAILURES).not.toHaveBeenCalled();
	});

	it("resolves false on a refusal: logged with the payload and counted, never thrown", async () => {
		MOCK_INDIRECT.mockRejectedValue(new Error("message-manager down"));
		const payload = { ids: ["id1"], deleted: 1, actor: "ops-alice" };

		await expect(
			load().publishDlqEvent("dlq.entries.deleted" as never, payload as never)
		).resolves.toBe(false);

		expect(MOCK_FAILURES).toHaveBeenCalledWith({
			event: "dlq.entries.deleted",
		});
		expect(MOCK_ERROR).toHaveBeenCalledWith(
			"DLQ event not published: the audit trail misses it",
			expect.objectContaining({ topic: "dlq.entries.deleted", payload })
		);
	});
});
