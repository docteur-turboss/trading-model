import { describe, expect, it } from "@jest/globals";
import { parseApiKey, requiredScope } from "../../src/shared/api-keys";
import { PUBLIC_ROUTES } from "../../src/shared/public-routes";

describe("parseApiKey", () => {
	it("reads name, scopes and secret, the secret after the last colon", () => {
		expect(parseApiKey("ops-alice:read+dlq:write:s3cr3t")).toEqual({
			name: "ops-alice",
			scopes: ["read", "dlq:write"],
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

	it("refuses a bare secret without quoting it", () => {
		const result = parseApiKey("old-shared-secret") as { error: string };

		expect(result.error).toContain("bare secret");
		expect(result.error).not.toContain("old-shared");
	});
});

describe("requiredScope", () => {
	it("needs read for GET and dlq:write otherwise", () => {
		expect(requiredScope("GET")).toBe("read");
		expect(requiredScope("POST")).toBe("dlq:write");
		expect(requiredScope("DELETE")).toBe("dlq:write");
	});

	it("only DLQ routes are public writes: dlq:write covers no other route", () => {
		const writes = PUBLIC_ROUTES.filter((route) => !route.startsWith("GET "));

		expect(writes.every((route) => route.includes(" /dlq-service/dlq"))).toBe(
			true
		);
	});
});
