import { execFileSync } from "node:child_process";
import { describe, expect, it } from "@jest/globals";
import { externalRequest, GATEWAY_API_KEY } from "./helpers";

describe("Security E2E", () => {
	describe("Gateway", () => {
		it.each([
			"/v1/audit-logger/events?id=1' OR '1'='1",
			"/v1/audit-logger/events?name=foo; DROP TABLE services",
			"/v1/audit-logger/events?offset=0 UNION SELECT * FROM users",
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

	describe("Docker socket proxy", () => {
		const proxyStatus = (path: string, method = "GET"): string =>
			execFileSync(
				"docker",
				[
					"run",
					"--rm",
					"--network",
					"trading-docker-api-network",
					"curlimages/curl",
					"-s",
					"-o",
					"/dev/null",
					"-w",
					"%{http_code}",
					"-X",
					method,
					`http://trading-docker-socket-proxy:2375${path}`,
				],
				{ encoding: "utf8" }
			);

		it("answers the allowed container list", () => {
			expect(proxyStatus("/containers/json")).toBe("200");
			expect(proxyStatus("/networks")).toBe("200");
		});

		it("lets promtail read logs (unknown id: daemon 404, not proxy 403)", () => {
			expect(proxyStatus("/containers/abc123/logs?stdout=1")).toBe("404");
		});

		it.each([
			["GET", "/containers/abc123/archive?path=/etc", "403"],
			["GET", "/containers/abc123/export", "403"],
			// wollomatic answers 405 for a method outside -allowGET
			["POST", "/containers/abc123/start", "405"],
		])("refuses %s %s", (method, path, status) => {
			expect(proxyStatus(path, method)).toBe(status);
		});
	});
});
