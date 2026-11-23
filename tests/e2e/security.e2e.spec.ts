import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
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
		const proxy = (
			path: string,
			method = "GET",
			format = "%{http_code}"
		): string =>
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
					format === "%{http_code}" ? "/dev/null" : "-",
					"-w",
					format,
					"-X",
					method,
					`http://trading-docker-socket-proxy:2375${path}`,
				],
				{ encoding: "utf8" }
			);
		const proxyStatus = (path: string, method = "GET"): string =>
			proxy(path, method);
		const proxyBody = (path: string): string => proxy(path, "GET", "");
		const docker = (...args: string[]): string =>
			execFileSync("docker", args, { encoding: "utf8" }).trim();

		// A container of another compose project, holding a secret in its Env (issue #2409).
		const OTHER = "trading-e2e-other-project";
		let otherId = "";
		let projectId = "";
		beforeAll(() => {
			docker("rm", "-f", OTHER);
			otherId = docker(
				"run",
				"-d",
				"--name",
				OTHER,
				"--label",
				"com.docker.compose.project=another-project",
				"-e",
				"OTHER_SECRET=leak",
				"curlimages/curl",
				"sleep",
				"300"
			);
			projectId = docker(
				"inspect",
				"-f",
				"{{.Id}}",
				"trading-docker-socket-proxy"
			);
		});
		afterAll(() => {
			docker("rm", "-f", OTHER);
		});

		it("answers the allowed container list, filtered on the compose project", () => {
			expect(proxyStatus("/containers/json")).toBe("200");
			expect(proxyStatus("/networks")).toBe("200");
			const names = proxyBody("/containers/json?all=1");
			expect(names).toContain("trading-docker-socket-proxy");
			expect(names).not.toContain(OTHER);
		});

		it("inspects a project container without its Env", () => {
			const info = JSON.parse(proxyBody(`/containers/${projectId}/json`));
			expect(info.Config.Labels["com.docker.compose.project"]).toBeDefined();
			expect(info.Config.Env).toBeUndefined();
		});

		it("lets promtail read the logs of a project container", () => {
			expect(proxyStatus(`/containers/${projectId}/logs?stdout=1&tail=1`)).toBe(
				"200"
			);
		});

		it("hides the containers of another project and unknown ids", () => {
			expect(proxyStatus(`/containers/${otherId}/json`)).toBe("403");
			expect(proxyStatus(`/containers/${otherId}/logs?stdout=1`)).toBe("403");
			expect(proxyStatus("/containers/abc123/logs?stdout=1")).toBe("403");
		});

		it.each([
			["GET", "/containers/abc123/archive?path=/etc", "403"],
			["GET", "/containers/abc123/export", "403"],
			["GET", "/images/json", "403"],
			["POST", "/containers/abc123/start", "403"],
		])("refuses %s %s", (method, path, status) => {
			expect(proxyStatus(path, method)).toBe(status);
		});
	});
});
