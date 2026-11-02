import { describe, expect, it } from "@jest/globals";
import { isPublicRoute } from "../../src/shared/public-routes";

describe("isPublicRoute", () => {
	it("accepts a public route, its parameters bound to any segment", () => {
		expect(isPublicRoute("GET", "audit-logger", "/events")).toBe(true);
		expect(isPublicRoute("GET", "audit-logger", "/events/abc-123")).toBe(true);
		expect(isPublicRoute("POST", "dlq-service", "/dlq/replay")).toBe(true);
	});

	it("matches a legacy registration name on its canonical service", () => {
		expect(
			isPublicRoute(
				"GET",
				"financial-scraper-service",
				"/candles/symbols/BTCUSDT"
			)
		).toBe(true);
	});

	it("refuses service-to-service routes", () => {
		expect(isPublicRoute("POST", "discovery-server", "/register")).toBe(false);
		expect(isPublicRoute("POST", "discovery-server", "/heartbeat")).toBe(false);
		expect(isPublicRoute("POST", "message-manager", "/message")).toBe(false);
		expect(isPublicRoute("DELETE", "message-manager", "/subscribe")).toBe(
			false
		);
	});

	it("refuses another method on a public path", () => {
		expect(isPublicRoute("DELETE", "audit-logger", "/events")).toBe(false);
	});

	it("refuses extra, missing or empty segments", () => {
		expect(isPublicRoute("GET", "audit-logger", "/events/a/b")).toBe(false);
		expect(isPublicRoute("GET", "audit-logger", "/")).toBe(false);
		expect(isPublicRoute("GET", "audit-logger", "/events/")).toBe(false);
		expect(isPublicRoute("GET", "audit-logger", "/events//stats")).toBe(false);
	});

	it("refuses a path that URL normalization would rewrite", () => {
		for (const path of [
			"/services/../register",
			"/services/%2e%2e/register",
			"/services/%2E./register",
			"/services/./x",
			"/services\\..\\register",
		]) {
			expect(isPublicRoute("GET", "discovery-server", path)).toBe(false);
		}
	});
});
