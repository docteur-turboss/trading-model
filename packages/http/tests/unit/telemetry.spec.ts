import { dropCallerIdentifiers, isProbeRequest } from "../../src/telemetry";

describe("isProbeRequest", () => {
	it.each(["/ping", "/health/ready", "/metrics", "/metrics?x=1", "/ping?a=b"])(
		"ignores %s",
		(url) => expect(isProbeRequest({ url })).toBe(true)
	);
	it.each(["/v1/foo", "/metrics-export", "/ping/x", "/", undefined])(
		"traces %s",
		(url) => expect(isProbeRequest({ url })).toBe(false)
	);
});

describe("dropCallerIdentifiers", () => {
	it("overrides User-Agent and query string with undefined", () => {
		expect(dropCallerIdentifiers()).toEqual({
			"user_agent.original": undefined,
			"url.query": undefined,
		});
		expect(Object.keys(dropCallerIdentifiers())).toEqual([
			"user_agent.original",
			"url.query",
		]);
	});
});
