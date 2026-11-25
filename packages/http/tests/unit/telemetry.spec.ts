import type { AddressInfo } from "node:net";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
	createExpressInstrumentation,
	createHttpInstrumentation,
	isProbeRequest,
} from "../../src/telemetry";

describe("createExpressInstrumentation", () => {
	it("ignores middleware layers", () => {
		expect(createExpressInstrumentation().getConfig().ignoreLayersType).toEqual(
			["middleware"]
		);
	});
});

describe("isProbeRequest", () => {
	it.each(["/ping", "/health/ready", "/metrics", "/metrics?x=1", "/ping?a=b"])(
		"ignores %s",
		(url) => expect(isProbeRequest({ url })).toBe(true)
	);
	it.each(["/v1/foo", "/metrics-export", "/ping/x", "/", undefined])(
		"traces %s",
		(url) => expect(isProbeRequest({ url })).toBe(false)
	);
});

describe("createHttpInstrumentation", () => {
	it("keeps neither User-Agent nor query string on the server span", async () => {
		const spans: { kind: number; attributes: Record<string, unknown> }[] = [];
		const instrumentation = createHttpInstrumentation();
		const sdk = new NodeSDK({
			traceExporter: {
				export: (batch, done) => {
					spans.push(...batch);
					done({ code: 0 });
				},
				shutdown: async () => undefined,
			},
			instrumentations: [instrumentation],
			metricReaders: [],
			logRecordProcessors: [],
		});
		sdk.start();
		const http = require("node:http") as typeof import("node:http");
		// Jest bypasses the require hook that patches `http`: patch it by hand.
		instrumentation
			.init()
			?.find((d) => d.name === "http")
			?.patch?.(http);
		const server = http.createServer((_req, res) => res.end("ok"));
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		const { port } = server.address() as AddressInfo;
		await new Promise<void>((resolve, reject) =>
			http
				.get(
					`http://127.0.0.1:${port}/x?token=1`,
					{ headers: { "User-Agent": "audit-test" } },
					(res) => res.resume().on("end", resolve)
				)
				.on("error", reject)
		);
		await new Promise((r) => server.close(r));
		await sdk.shutdown();
		const attrs = spans.find((s) => s.kind === 1)?.attributes;
		expect(attrs?.["url.path"]).toBe("/x");
		expect(Object.keys(attrs ?? {})).not.toContain("url.query");
		expect(Object.keys(attrs ?? {})).not.toContain("user_agent.original");
	});
});
