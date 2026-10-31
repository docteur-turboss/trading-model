import { describe, expect, it, jest } from "@jest/globals";
import {
	CALLER,
	e2eTestTimeout,
	externalRequest,
	GATEWAY_API_KEY,
	meshRequest,
} from "./helpers";

jest.setTimeout(e2eTestTimeout);

const REGISTER = "https://discovery-server:3000/register";

function register(body: unknown): number {
	return meshRequest(CALLER.scraper, REGISTER, { method: "POST", body }).status;
}

describe("Security E2E", () => {
	describe("Discovery registration input", () => {
		const xssPayloads = [
			'<script>alert("xss")</script>',
			'"><script>alert(1)</script>',
			"<img src=x onerror=alert(1)>",
			"javascript:alert(1)",
		];

		it.each(xssPayloads)("rejects the XSS serviceName %s", (payload) => {
			const status = register({
				serviceName: payload,
				instanceId: "xss-test",
				ip: "127.0.0.1",
				port: 9999,
			});
			expect([400, 403]).toContain(status);
		});

		it("is not polluted through __proto__ / constructor keys", () => {
			for (const payload of [
				'{"serviceName":"financial-scraper-service","__proto__":{"polluted":true}}',
				'{"serviceName":"financial-scraper-service","constructor":{"prototype":{"polluted":true}}}',
			]) {
				const status = register(JSON.parse(payload));
				expect(status).toBeLessThan(500);
			}
			const { status } = meshRequest(
				CALLER.scraper,
				"https://discovery-server:3000/health/ready"
			);
			expect(status).toBe(200);
		});

		it("rejects an oversized registration without crashing", () => {
			const status = register({
				serviceName: "x".repeat(10000),
				instanceId: "x".repeat(10000),
				ip: "127.0.0.1",
				port: 9999,
				extra: "x".repeat(50000),
			});
			expect(status).toBeGreaterThanOrEqual(400);
			expect(status).toBeLessThan(500);
		});
	});

	describe("Gateway", () => {
		it.each([
			"/v1/discovery-server/services?id=1' OR '1'='1",
			"/v1/discovery-server/services?name=foo; DROP TABLE services",
			"/v1/discovery-server/services?offset=0 UNION SELECT * FROM users",
		])("handles the SQL injection attempt %s", async (path) => {
			const { status } = await externalRequest(encodeURI(path), {
				headers: { "x-api-key": GATEWAY_API_KEY },
			});
			expect(status).toBeLessThan(500);
		});

		it("does not leak stack traces in error responses", async () => {
			const { body } = await externalRequest("/v1/nonexistent/route", {
				headers: { "x-api-key": "invalid-key" },
			});
			expect(body).not.toMatch(/Error:/);
			expect(body).not.toMatch(/at\s+\w+\s+\(/);
			expect(body).not.toMatch(/node_modules/);
		});
	});
});
