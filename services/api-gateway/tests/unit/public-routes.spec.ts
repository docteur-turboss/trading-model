import { describe, expect, it } from "@jest/globals";
import { matchPublicRoute } from "../../src/shared/public-routes";

const isPublicRoute = (...args: Parameters<typeof matchPublicRoute>) =>
	matchPublicRoute(...args) !== undefined;

describe("isPublicRoute", () => {
	it("returns the route pattern, never the raw path", () => {
		expect(matchPublicRoute("GET", 1, "audit-logger", "/events/abc-123")).toBe(
			"/v1/audit-logger/events/:messageId"
		);
	});

	it("accepts a public route, its parameters bound to any segment", () => {
		expect(isPublicRoute("GET", 1, "audit-logger", "/events")).toBe(true);
		expect(isPublicRoute("GET", 1, "audit-logger", "/events/abc-123")).toBe(
			true
		);
	});

	it("matches a legacy registration name on its canonical service", () => {
		expect(
			isPublicRoute(
				"GET",
				2,
				"financial-scraper-service",
				"/candles/symbols/BTCUSDT"
			)
		).toBe(true);
	});

	// ADR-0072: a service answers only the majors PUBLIC_ROUTES lists for it.
	it("refuses a major the service does not serve", () => {
		expect(
			isPublicRoute("GET", 1, "financial-scraper", "/candles/symbols/BTCUSDT")
		).toBe(false);
		expect(isPublicRoute("GET", 2, "audit-logger", "/events")).toBe(false);
	});

	it("refuses service-to-service routes", () => {
		expect(isPublicRoute("POST", 1, "audit-logger", "/message")).toBe(false);
	});

	it("refuses another method on a public path", () => {
		expect(isPublicRoute("DELETE", 1, "audit-logger", "/events")).toBe(false);
	});

	it("refuses extra, missing or empty segments", () => {
		expect(isPublicRoute("GET", 1, "audit-logger", "/events/a/b")).toBe(false);
		expect(isPublicRoute("GET", 1, "audit-logger", "/")).toBe(false);
		expect(isPublicRoute("GET", 1, "audit-logger", "/events/")).toBe(false);
		expect(isPublicRoute("GET", 1, "audit-logger", "/events//stats")).toBe(
			false
		);
	});

	it("refuses a path that URL normalization would rewrite", () => {
		for (const path of [
			"/events/../stats",
			"/events/%2e%2e/stats",
			"/events/%2E./stats",
			"/events/./x",
			"/events\\..\\stats",
		]) {
			expect(isPublicRoute("GET", 1, "audit-logger", path)).toBe(false);
		}
	});
});
