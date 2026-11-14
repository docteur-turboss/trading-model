import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

/**
 * Proves on a real Node process that a request produces a server span and an
 * Express span when telemetry starts before Express is loaded (issue #599),
 * and none when it starts after. The spans go through the real OTLP/HTTP
 * exporter to a receiver run by this test.
 */

const FIXTURE = join(__dirname, "fixtures", "traced-server.js");
const RESOLVER = join(__dirname, "support", "resolve-workspace-src.cjs");

interface ExportedSpan {
	name: string;
	kind: number;
}

/** OTLP span kind of an incoming request. */
const SPAN_KIND_SERVER = 2;

let receiver: Server;
let endpoint: string;
let spans: ExportedSpan[] = [];

beforeAll(async () => {
	receiver = createServer((req, res) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
			if (req.url !== "/v1/traces") {
				return;
			}
			const payload = JSON.parse(body) as {
				resourceSpans: { scopeSpans: { spans: ExportedSpan[] }[] }[];
			};
			for (const resource of payload.resourceSpans) {
				for (const scope of resource.scopeSpans) {
					spans.push(...scope.spans);
				}
			}
		});
	});
	await new Promise<void>((resolve) =>
		receiver.listen(0, "127.0.0.1", resolve)
	);
	endpoint = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise((resolve) => receiver.close(resolve));
});

beforeEach(() => {
	spans = [];
});

function runFixture(mode: "early" | "late"): Promise<number | null> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			["-r", "ts-node/register/transpile-only", "-r", RESOLVER, FIXTURE, mode],
			{
				env: { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: endpoint },
				stdio: "inherit",
			}
		);
		child.on("error", reject);
		child.on("exit", resolve);
	});
}

describe("telemetry start order", () => {
	it("records server and Express spans when started before Express loads", async () => {
		expect(await runFixture("early")).toBe(0);

		expect(spans).toContainEqual(
			expect.objectContaining({ kind: SPAN_KIND_SERVER, name: "GET /traced" })
		);
		expect(spans.map((span) => span.name)).toContain(
			"request handler - /traced"
		);
	}, 20_000);

	it("records no server span when started after Express loads", async () => {
		expect(await runFixture("late")).toBe(0);

		expect(spans.filter((span) => span.kind === SPAN_KIND_SERVER)).toEqual([]);
	}, 20_000);
});
