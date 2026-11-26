import { describe, expect, it } from "@jest/globals";
import {
	hasRetiredScope,
	hasScope,
	parseApiKey,
	requiredScope,
} from "../../src/shared/api-keys";
import { PUBLIC_ROUTES } from "../../src/shared/public-routes";

describe("parseApiKey", () => {
	it("reads name, scopes and secret, the secret after the last colon", () => {
		expect(parseApiKey("ops-alice:read:s3cr3t")).toEqual({
			name: "ops-alice",
			scopes: ["read"],
			secret: "s3cr3t",
		});
		expect(parseApiKey("grafana:read:abc")).toMatchObject({
			name: "grafana",
			scopes: ["read"],
		});
	});

	it.each([
		["bad name!:read:s", "key name"],
		["ops:admin:s", "scopes"],
		["ops:s", "scopes"],
		["ops:read:", "empty secret"],
	])("refuses %j without quoting the secret", (entry, reason) => {
		const result = parseApiKey(entry) as { error: string };

		expect(result.error).toContain(reason);
		expect(result.error).not.toContain(":s");
	});

	it("accepts then ignores the retired dlq:write scope of an N-1 token (#1241)", () => {
		expect(parseApiKey("ops:read+dlq:write:s3cr3t")).toEqual({
			name: "ops",
			scopes: ["read"],
			secret: "s3cr3t",
		});
		expect(parseApiKey("old:dlq:write:s3cr3t")).toEqual({
			name: "old",
			scopes: [],
			secret: "s3cr3t",
		});
	});

	it("flags the keys that still declare dlq:write, for the startup warning", () => {
		expect(hasRetiredScope(["a:read:x", "ops:read+dlq:write:y"])).toBe(true);
		expect(hasRetiredScope(["a:read+risk:admin:x", "bare"])).toBe(false);
	});

	it("refuses a bare secret without quoting it", () => {
		const result = parseApiKey("old-shared-secret") as { error: string };

		expect(result.error).toContain("bare secret");
		expect(result.error).not.toContain("old-shared");
	});
});

describe("requiredScope", () => {
	it("needs a scope per route family", () => {
		expect(requiredScope("GET", "/v1/trader-trainer/best-agent")).toBe("read");
		expect(requiredScope("GET", "/v1/audit-logger/events")).toBe("audit:read");
		expect(requiredScope("POST", "/v1/risk-execution/admin/kill-switch")).toBe(
			"risk:admin"
		);
		expect(
			requiredScope("POST", "/v1/risk-execution/admin/kill-switch/rearm")
		).toBe("risk:rearm");
	});

	it("lets risk:admin re-arm but not read the audit", () => {
		expect(hasScope(["risk:admin"], "risk:rearm")).toBe(true);
		expect(hasScope(["risk:rearm"], "risk:admin")).toBe(false);
		expect(hasScope(["read"], "audit:read")).toBe(false);
	});

	it("only kill switch routes are public writes", () => {
		const writes = PUBLIC_ROUTES.filter((route) => !route.startsWith("GET "));

		expect(writes.every((route) => route.includes("/risk-execution/"))).toBe(
			true
		);
	});
});
