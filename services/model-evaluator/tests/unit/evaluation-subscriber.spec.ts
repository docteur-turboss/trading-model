import { describe, expect, it, jest } from "@jest/globals";
import { setLogger } from "@trading-model/contracts/logger-registry";
import {
	createMessageHandler,
	createModelPublishedListener,
} from "../../src/adapters/inbound/evaluation-subscriber";

const SHA = "a".repeat(64);
const call = (
	handler: ReturnType<typeof createMessageHandler>,
	payload: unknown
) =>
	handler(
		{
			body: {
				metadata: { topic: "training.model.published", messageId: "m-1" },
				payload,
			},
		} as never,
		{} as never
	);

describe("training.model.published handler", () => {
	it("evaluates a valid event and acknowledges it", async () => {
		const evaluate = jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue("recorded");
		const handler = createMessageHandler(evaluate as never);
		const res = await call(handler, {
			symbol: "BTCUSDT",
			version: "v1",
			sha256: SHA,
		});
		expect(evaluate).toHaveBeenCalledWith(
			expect.objectContaining({ symbol: "BTCUSDT", version: "v1" }),
			undefined
		);
		expect(res).toMatchObject({ status: 200, data: { status: "recorded" } });
	});

	it("answers 400 to a malformed payload without evaluating", async () => {
		const warn = jest.fn<(...args: any[]) => any>();
		setLogger({ warn } as never);
		const evaluate = jest.fn<(...args: any[]) => any>();
		const res = await call(createMessageHandler(evaluate as never), {
			symbol: "../x",
		});
		expect(evaluate).not.toHaveBeenCalled();
		expect(res).toMatchObject({ status: 400 });
		expect(warn).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				topic: "training.model.published",
				messageId: "m-1",
			})
		);
	});

	// The bus consumer (brokerMessage.on): same evaluation, a malformed payload is dead-lettered.
	it("evaluates through the bus listener and dead-letters a malformed payload", async () => {
		setLogger({ warn: jest.fn() } as never);
		const evaluate = jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue("recorded");
		const listener = createModelPublishedListener(evaluate as never);
		const metadata = { topic: "training.model.published", messageId: "m-2" };

		await listener({ symbol: "BTCUSDT", version: "v1", sha256: SHA }, metadata);
		await expect(listener({ symbol: "../x" }, metadata)).rejects.toMatchObject({
			reason: "REJECTED_BY_SUBSCRIBER",
		});
		expect(evaluate).toHaveBeenCalledTimes(1);
	});
});
