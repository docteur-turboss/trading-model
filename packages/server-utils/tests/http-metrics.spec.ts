import http from "node:http";
import express from "express";
import promClient from "prom-client";
import {
	httpMetricsMiddleware,
	UNMATCHED_ROUTE,
} from "../src/adapters/inbound/http-metrics";

function get(app: http.RequestListener, path: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = http.createServer(app);
		server.listen(0, () => {
			const { port } = server.address() as { port: number };
			http
				.get({ hostname: "localhost", port, path }, (res) => {
					res.resume();
					res.on("end", () => {
						server.close();
						resolve(res.statusCode ?? 0);
					});
				})
				.on("error", (err) => {
					server.close();
					reject(err);
				});
		});
	});
}

async function metric(
	name: string
): Promise<promClient.MetricObjectWithValues<promClient.MetricValue<string>>> {
	const found = (await promClient.register.getMetricsAsJSON()).find(
		(m) => m.name === name
	);
	if (!found) {
		throw new Error(`metric ${name} not registered`);
	}
	return found as promClient.MetricObjectWithValues<
		promClient.MetricValue<string>
	>;
}

function buildApp(): express.Application {
	const app = express();
	app.use(httpMetricsMiddleware);
	const router = express.Router();
	router.get("/instances/:id", (_req, res) => {
		res.status(500).send("boom");
	});
	app.use("/v1", router);
	app.get("/ok", (_req, res) => {
		res.send("ok");
	});
	return app;
}

describe("httpMetricsMiddleware", () => {
	beforeEach(() => {
		promClient.register.resetMetrics();
	});

	it("labels a request with its route pattern, not the raw URL", async () => {
		const app = buildApp();
		await get(app, "/v1/instances/abc-123");
		await get(app, "/v1/instances/def-456");

		const counter = await metric("http_requests_total");
		expect(counter.values).toEqual([
			expect.objectContaining({
				labels: { method: "GET", path: "/v1/instances/:id", status: "500" },
				value: 2,
			}),
		]);
	});

	it("puts every unmatched URL in one series", async () => {
		const app = buildApp();
		await get(app, "/wp-login.php");
		await get(app, "/.env");

		const counter = await metric("http_requests_total");
		expect(counter.values).toEqual([
			expect.objectContaining({
				labels: { method: "GET", path: UNMATCHED_ROUTE, status: "404" },
				value: 2,
			}),
		]);
	});

	it("records the latency with buckets above the 5s alert threshold", async () => {
		const app = buildApp();
		await get(app, "/ok");

		const histogram = await metric("http_request_duration_seconds");
		const bounds = histogram.values
			.filter((v) => v.metricName === "http_request_duration_seconds_bucket")
			.map((v) => v.labels.le);
		expect(bounds).toEqual(expect.arrayContaining([10, 30, "+Inf"]));
	});

	it("brings the in-flight gauge back to zero once the response is closed", async () => {
		const app = buildApp();
		await get(app, "/ok");
		await new Promise((resolve) => setImmediate(resolve));

		const gauge = await metric("http_requests_in_flight");
		expect(gauge.values[0]?.value).toBe(0);
	});
});

describe("build_info", () => {
	it("is a gauge at 1 with service, version and git_sha labels", async () => {
		// resetMetrics() in the other suite clears it: load module and prom-client afresh.
		let values: promClient.MetricValue<string>[] = [];
		await jest.isolateModulesAsync(async () => {
			require("../src/adapters/inbound/http-metrics");
			const fresh = require("prom-client");
			const found = (await fresh.register.getMetricsAsJSON()).find(
				(x: { name: string }) => x.name === "build_info"
			);
			values = found.values;
		});
		const m = { values };
		expect(m.values).toHaveLength(1);
		expect(m.values[0].value).toBe(1);
		expect(Object.keys(m.values[0].labels).sort()).toEqual([
			"git_sha",
			"service",
			"version",
		]);
	});
});
