import { describe, expect, it, jest } from "@jest/globals";
import { e2eTestTimeout, fetchUrl, PORTS } from "./helpers";

jest.setTimeout(e2eTestTimeout);

const DISCOVERY = `https://localhost:${PORTS.discovery}`;
const GATEWAY = `https://localhost:${PORTS.gateway}`;
const API_KEY = process.env.AUTH_TOKENS || "test-api-key";

describe("Security Injection Tests", () => {
	// XSS vectors
	const xssPayloads = [
		'<script>alert("xss")</script>',
		'"><script>alert(1)</script>',
		"<img src=x onerror=alert(1)>",
		"javascript:alert(1)",
	];

	// Prototype pollution vectors
	const pollutionPayloads = [
		{ serviceName: "test", __proto__: { polluted: true } },
		{ serviceName: "test", constructor: { prototype: { polluted: true } } },
	];

	describe("Discovery Server - XSS resistance", () => {
		for (const payload of xssPayloads) {
			it(`should handle XSS payload in serviceName: ${payload.slice(0, 30)}`, async () => {
				const { status } = await fetchUrl(`${DISCOVERY}/register`, {
					method: "POST",
					body: {
						serviceName: payload,
						instanceId: "xss-test",
						ip: "127.0.0.1",
						port: 9999,
					},
				});
				// Should not crash - either 201 (accepted) or 400 (rejected)
				expect(status).toBeGreaterThanOrEqual(200);
				expect(status).toBeLessThan(500);
			});
		}
	});

	describe("Discovery Server - Prototype pollution resistance", () => {
		for (const payload of pollutionPayloads) {
			it("should handle prototype pollution attempt", async () => {
				const { status } = await fetchUrl(`${DISCOVERY}/register`, {
					method: "POST",
					body: payload,
				});
				expect(status).toBeGreaterThanOrEqual(200);
				expect(status).toBeLessThan(500);
			});
		}
	});

	describe("Discovery Server - Oversized payload resistance", () => {
		it("should reject excessively large payloads", async () => {
			const largeBody = {
				serviceName: "x".repeat(10000),
				instanceId: "x".repeat(10000),
				ip: "127.0.0.1",
				port: 9999,
				extra: "x".repeat(50000),
			};
			const { status } = await fetchUrl(`${DISCOVERY}/register`, {
				method: "POST",
				body: largeBody,
			});
			// Should either reject (413/400) or accept - but not crash
			expect(status).not.toBe(500);
		});
	});

	describe("API Gateway - SQL injection via proxy path", () => {
		const sqliPaths = [
			`/v1/discovery-server/services?id=1' OR '1'='1`,
			"/v1/discovery-server/services?name=foo; DROP TABLE services",
			"/v1/discovery-server/services?offset=0 UNION SELECT * FROM users",
		];

		for (const path of sqliPaths) {
			it(`should handle SQL injection attempt in path: ${path.slice(0, 50)}`, async () => {
				const { status } = await fetchUrl(`${GATEWAY}${path}`, {
					headers: { "x-api-key": API_KEY },
				});
				expect(status).not.toBe(500);
			});
		}
	});

	describe("Error response - no sensitive info leak", () => {
		it("should not leak stack traces in error responses", async () => {
			const { body } = await fetchUrl(`${GATEWAY}/v1/nonexistent/route`, {
				headers: { "x-api-key": "invalid-key" },
			});
			expect(body).not.toMatch(/Error:/);
			expect(body).not.toMatch(/at\s+\w+/);
			expect(body).not.toMatch(/node_modules/);
		});
	});
});
