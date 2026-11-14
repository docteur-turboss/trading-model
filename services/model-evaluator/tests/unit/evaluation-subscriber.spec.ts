import { describe, expect, it, jest } from "@jest/globals";
import { createMessageHandler } from "../../src/adapters/inbound/evaluation-subscriber";

const SHA = "a".repeat(64);
const call = (
	handler: ReturnType<typeof createMessageHandler>,
	payload: unknown
) =>
	handler(
		{
			body: { metadata: { topic: "training.model.published" }, payload },
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
			expect.objectContaining({ symbol: "BTCUSDT", version: "v1" })
		);
		expect(res).toMatchObject({ status: 200, data: { status: "recorded" } });
	});

	it("answers 400 to a malformed payload without evaluating", async () => {
		const evaluate = jest.fn<(...args: any[]) => any>();
		const res = await call(createMessageHandler(evaluate as never), {
			symbol: "../x",
		});
		expect(evaluate).not.toHaveBeenCalled();
		expect(res).toMatchObject({ status: 400 });
	});
});
