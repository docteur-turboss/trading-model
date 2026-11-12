import http from "node:http";
import { DurationMs } from "@trading-model/primitives/primitives";
import express from "express";
import {
	createReadinessHandler,
	type ReadinessCheck,
} from "../src/adapters/inbound/readiness";

function makeRequest(
	app: express.Express,
	path: string
): Promise<{ statusCode: number; body: string }> {
	return new Promise((resolve, reject) => {
		const server = http.createServer(app);
		server.listen(0, () => {
			const addr = server.address() as { port: number };
			http
				.get(`http://localhost:${addr.port}${path}`, (res) => {
					let data = "";
					res.on("data", (chunk: string) => {
						data += chunk;
					});
					res.on("end", () => {
						server.close();
						resolve({ statusCode: res.statusCode ?? 0, body: data });
					});
				})
				.on("error", reject);
		});
	});
}

describe("createReadinessHandler", () => {
	it("should return 200 when all checks pass", async () => {
		const checks: ReadinessCheck[] = [
			{ name: "db", check: () => true },
			{ name: "redis", check: () => true },
		];
		const app = express();
		app.get("/health/ready", createReadinessHandler(checks));
		const { statusCode, body } = await makeRequest(app, "/health/ready");
		expect(statusCode).toBe(200);
		expect(JSON.parse(body).status).toBe("ok");
	});

	it("should return 503 when a check fails", async () => {
		const checks: ReadinessCheck[] = [
			{ name: "db", check: () => true },
			{ name: "redis", check: () => false },
		];
		const app = express();
		app.get("/health/ready", createReadinessHandler(checks));
		const { statusCode } = await makeRequest(app, "/health/ready");
		expect(statusCode).toBe(503);
	});

	it("should return 503 when a check throws", async () => {
		const checks: ReadinessCheck[] = [
			{
				name: "db",
				check: () => {
					throw new Error("boom");
				},
			},
		];
		const app = express();
		app.get("/health/ready", createReadinessHandler(checks));
		const { statusCode } = await makeRequest(app, "/health/ready");
		expect(statusCode).toBe(503);
	});

	it("should handle async checks", async () => {
		const checks: ReadinessCheck[] = [
			{ name: "async-check", check: async () => true },
		];
		const app = express();
		app.get("/health/ready", createReadinessHandler(checks));
		const { statusCode } = await makeRequest(app, "/health/ready");
		expect(statusCode).toBe(200);
	});

	it("should report a check that never answers as error within the bound", async () => {
		const checks: ReadinessCheck[] = [
			{ name: "hung", check: () => new Promise<boolean>(() => {}) },
			{ name: "db", check: () => true },
		];
		const app = express();
		app.get("/health/ready", createReadinessHandler(checks, DurationMs.of(50)));
		const started = Date.now();
		const { statusCode, body } = await makeRequest(app, "/health/ready");
		expect(Date.now() - started).toBeLessThan(1000);
		expect(statusCode).toBe(503);
		expect(JSON.parse(body).checks).toEqual({ hung: "error", db: "ok" });
	});
});
