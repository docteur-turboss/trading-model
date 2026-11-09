import { describe, expect, it } from "@jest/globals";
import { safeHeaders } from "../../src/shared/proxy-header-sanitizer";
import { createReq } from "../helpers/express";

describe("safeHeaders", () => {
	it("forwards only the anonymized caller address", () => {
		const headers = safeHeaders(
			createReq({
				ip: "203.0.113.57",
				headers: {
					"x-real-ip": "198.51.100.23",
					"x-forwarded-for": "198.51.100.23, 203.0.113.57",
				},
			})
		);

		expect(headers["x-real-ip"]).toBeUndefined();
		expect(headers["x-forwarded-for"]).toBe("203.0.113.0");
	});

	it("drops credentials and hop-by-hop headers", () => {
		const headers = safeHeaders(
			createReq({
				headers: {
					authorization: "Bearer t",
					"x-api-key": "k",
					host: "gateway",
					connection: "keep-alive",
					accept: "application/json",
				},
			})
		);

		expect(Object.keys(headers)).toEqual(
			expect.not.arrayContaining(["authorization", "x-api-key", "host"])
		);
		expect(headers.accept).toBe("application/json");
	});

	it("replaces a client x-actor with the API key name, never the key", () => {
		const headers = safeHeaders(
			createReq({
				apiKeyName: "ops-alice",
				headers: { "x-actor": "someone-else", "x-api-key": "the-secret" },
			})
		);

		expect(headers["x-actor"]).toBe("ops-alice");
		expect(JSON.stringify(headers)).not.toContain("the-secret");
	});

	it("drops a client x-actor when the request has no key name", () => {
		const headers = safeHeaders(
			createReq({ apiKeyName: null, headers: { "x-actor": "forged" } })
		);

		expect(headers["x-actor"]).toBeUndefined();
	});
});
