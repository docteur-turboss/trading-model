import { describe, expect, it, jest } from "@jest/globals";
import { setLogger } from "@trading-model/contracts/logger-registry";
import { createMessageHandler } from "../../src/adapters/inbound/evaluation-subscriber";

const SHA = "a".repeat(64);
const call = (
	handler: ReturnType<typeof createMessageHandler>,
	payload: unknown
) => handler({ metadata: { topic: "training.model.published" }, payload });

describe("training.model.published handler", () => {
	it("evaluates a valid event", async () => {
		const evaluate = jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue("recorded");
		const handler = createMessageHandler(evaluate as never);
		await call(handler, {
			symbol: "BTCUSDT",
			version: "v1",
			sha256: SHA,
		});
		expect(evaluate).toHaveBeenCalledWith(
			expect.objectContaining({ symbol: "BTCUSDT", version: "v1" }),
			undefined
		);
	});

	it("dead-letters a malformed payload at once, without evaluating", async () => {
		setLogger({ warn: jest.fn() } as never);
		const evaluate = jest.fn<(...args: any[]) => any>();
		await expect(
			call(createMessageHandler(evaluate as never), { symbol: "../x" })
		).rejects.toMatchObject({ reason: "REJECTED_BY_SUBSCRIBER" });
		expect(evaluate).not.toHaveBeenCalled();
	});
});
