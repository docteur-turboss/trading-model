import { describe, expect, it, jest } from "@jest/globals";

const post = jest.fn<(...args: any[]) => any>();
const get = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({ post, get }) },
}));
jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: async () => ({ host: "risk", port: 3000 }),
}));
jest.mock("../../src/infrastructure/config/env", () => ({ ENV: {} }));
const postIndirect = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/broker-message/create-message-manager", () => ({
	createServiceMessageManager: () => ({
		messageManager: { post: { indirect: postIndirect } },
	}),
}));

import { PromotionAudit } from "../../src/adapters/outbound/promotion-audit";
import { RiskClient } from "../../src/adapters/outbound/risk-client";

const INTENT = {
	decisionId: "d",
	symbol: "BTCUSDT",
	side: "buy" as const,
	quantity: 1,
	referencePrice: 1,
	referenceAt: 1,
	model: { symbol: "BTCUSDT", version: "v1" },
};

describe("RiskClient", () => {
	it("posts the intent to /intents and returns the result", async () => {
		post.mockResolvedValueOnce({ status: "accepted", clientOrderId: "o" });
		const result = await new RiskClient({} as never).send(INTENT);
		expect(result.status).toBe("accepted");
		expect(post.mock.calls[0][0]).toBe("https://risk:3000/intents");
	});

	it("reads the real position from /positions/:symbol", async () => {
		get.mockResolvedValueOnce({ symbol: "BTCUSDT", quantity: 0.5 });
		expect(await new RiskClient({} as never).position("BTCUSDT")).toBe(0.5);
		expect(get.mock.calls[0][0]).toBe("https://risk:3000/positions/BTCUSDT");
	});

	it("throws on an empty answer and on a malformed intent", async () => {
		post.mockResolvedValueOnce(undefined);
		await expect(new RiskClient({} as never).send(INTENT)).rejects.toThrow(
			/Empty/
		);
		await expect(
			new RiskClient({} as never).send({ ...INTENT, quantity: 0 })
		).rejects.toThrow();
	});
});

describe("PromotionAudit", () => {
	it("posts risk.promotion.loaded on the bus", async () => {
		await new PromotionAudit("i" as never).promotionLoaded({
			symbol: "BTCUSDT",
			version: "v1",
			sha256: "a".repeat(64),
		});
		expect(postIndirect.mock.calls[0][0]).toEqual({
			symbol: "BTCUSDT",
			version: "v1",
			sha256: "a".repeat(64),
		});
		expect(postIndirect.mock.calls[0][1].topic).toBe("risk.promotion.loaded");
	});
});
