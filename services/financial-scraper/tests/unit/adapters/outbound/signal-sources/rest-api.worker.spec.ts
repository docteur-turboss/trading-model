import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { createRestApiWorker } from "../../../../../src/adapters/outbound/signal-sources/rest-api.worker";
import {
	InvalidPayloadError,
	NOT_MODIFIED,
} from "../../../../../src/domain/ports/signal-source.port";
import type { Source } from "../../../../../src/domain/signals";

const KEY = "s3cr3t-key-value";
const QUERY_AUTH = {
	type: "api_key",
	env: "SIGNAL_KEY_TEST",
	in: "query",
	name: "api_key",
} as const;

/** Answers each path with its status and body; records the last request. */
const ROUTES: Record<string, [number, string]> = {
	"/json": [200, '{"lastPrice":"1.5"}'],
	"/down": [503, "maintenance"],
	"/denied": [401, "bad key"],
	"/csv": [200, 'a;b\r\n"x;1";"say ""hi"""\r\n2;3'],
	"/badcsv": [200, "a,b\n1"],
	"/bom": [200, "﻿a,b\n1,2\n\n3,4\n\n"],
	"/html": [200, "<!DOCTYPE html><title>moved</title>"],
};

let serverTag = '"v1"';

describe("rest_api worker", () => {
	let server: Server;
	let base: string;
	let last: IncomingMessage | undefined;
	let chunksSent = 0;

	beforeAll(async () => {
		server = createServer((req, res) => {
			last = req;
			if (req.url === "/big") {
				// 1 MB chunks, 40 MB on offer: stops when the client hangs up.
				res.writeHead(200);
				chunksSent = 0;
				const chunk = "x".repeat(1024 * 1024);
				const timer = setInterval(() => {
					if (res.destroyed || chunksSent >= 40) {
						clearInterval(timer);
						res.end();
						return;
					}
					chunksSent++;
					res.write(chunk);
				}, 5);
				return;
			}
			if (req.url?.startsWith("/etag")) {
				const tag = serverTag;
				if (req.headers["if-none-match"] === tag) {
					res.writeHead(304).end();
				} else {
					res.writeHead(200, { etag: tag }).end('{"n":1}');
				}
				return;
			}
			const [status, body] = ROUTES[(req.url ?? "").split("?")[0]] ?? [404, ""];
			res.writeHead(status).end(body);
		});
		await new Promise<void>((resolve) => server.listen(0, () => resolve()));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	function fetchPath(
		path: string,
		auth: Source["accessPolicy"]["auth"] = "none",
		body?: Pick<Source, "format" | "delimiter">
	) {
		return createRestApiWorker("trading-model-test ops@example.org")(
			{
				subject: { assetId: "BTC" },
				dimension: "market",
				url: `${base}${path}`,
				params: {},
			},
			auth,
			body
		);
	}

	it("returns the JSON body and identifies itself", async () => {
		await expect(fetchPath("/json")).resolves.toEqual({ lastPrice: "1.5" });
		expect(last?.headers["user-agent"]).toBe(
			"trading-model-test ops@example.org"
		);
		expect(last?.headers.accept).toBe("application/json");
	});

	it("rejects on a non-2xx status, naming the host only", async () => {
		await expect(fetchPath("/down")).rejects.toThrow(
			`HTTP 503 from ${new URL(base).host}`
		);
	});

	it("retries a timeout in the same call, and gives up after 3 attempts", async () => {
		const timeout = () =>
			Promise.reject(
				Object.assign(new Error("timed out"), { name: "TimeoutError" })
			);
		const real = globalThis.fetch;
		const spy = jest
			.spyOn(globalThis, "fetch")
			.mockImplementationOnce(timeout)
			.mockImplementationOnce(timeout);
		try {
			await expect(fetchPath("/json")).resolves.toEqual({ lastPrice: "1.5" });
			expect(spy).toHaveBeenCalledTimes(3);
			spy.mockReset().mockImplementation(timeout);
			await expect(fetchPath("/json")).rejects.toThrow("TimeoutError from");
			expect(spy).toHaveBeenCalledTimes(3);
		} finally {
			globalThis.fetch = real;
		}
	});

	it("rejects with an InvalidPayloadError on a body that is not JSON", async () => {
		await expect(fetchPath("/html")).rejects.toBeInstanceOf(
			InvalidPayloadError
		);
	});

	it("decodes a declared CSV body and sends a CSV Accept", async () => {
		await expect(
			fetchPath("/csv", "none", { format: "csv", delimiter: ";" })
		).resolves.toEqual([
			{ a: "x;1", b: 'say "hi"' },
			{ a: "2", b: "3" },
		]);
		expect(last?.headers.accept).toBe("text/csv");
	});

	it("drops a leading BOM and blank lines", async () => {
		await expect(fetchPath("/bom", "none", { format: "csv" })).resolves.toEqual(
			[
				{ a: "1", b: "2" },
				{ a: "3", b: "4" },
			]
		);
	});

	it("refuses a CSV row of the wrong width", async () => {
		await expect(
			fetchPath("/badcsv", "none", { format: "csv" })
		).rejects.toBeInstanceOf(InvalidPayloadError);
	});

	it("returns raw text and refuses a body over the bound", async () => {
		await expect(
			fetchPath("/html", "none", { format: "text" })
		).resolves.toContain("moved");
		const big = fetchPath("/big", "none", { format: "text" });
		await expect(big).rejects.toThrow(/over/);
		await expect(big).rejects.not.toBeInstanceOf(InvalidPayloadError);
		expect(chunksSent).toBeLessThan(20);
	});

	it("sends confirmed validators back, 200 after a 304 replaces them, restart forgets them", async () => {
		const worker = createRestApiWorker("ua");
		const url = `${base}/etag`;
		const run = (w = worker) =>
			w(
				{ subject: { assetId: "BTC" }, dimension: "market", url, params: {} },
				"none"
			);
		serverTag = '"v1"';
		await expect(run()).resolves.toEqual({ n: 1 });
		// Not confirmed (body not stored): the next call is complete.
		await expect(run()).resolves.toEqual({ n: 1 });
		worker.confirm?.(url);
		await expect(run()).resolves.toBe(NOT_MODIFIED);
		expect(last?.headers["if-none-match"]).toBe('"v1"');
		serverTag = '"v2"';
		await expect(run()).resolves.toEqual({ n: 1 });
		worker.confirm?.(url);
		await expect(run()).resolves.toBe(NOT_MODIFIED);
		expect(last?.headers["if-none-match"]).toBe('"v2"');
		await expect(run(createRestApiWorker("ua"))).resolves.toEqual({ n: 1 });
		expect(last?.headers["if-none-match"]).toBeUndefined();
	});

	it("keeps validators of the last 64 URLs only", async () => {
		const worker = createRestApiWorker("ua");
		serverTag = '"v1"';
		const run = async (i: number) => {
			const url = `${base}/etag?d=${i}`;
			await worker(
				{ subject: { assetId: "BTC" }, dimension: "market", url, params: {} },
				"none"
			);
			return url;
		};
		for (let i = 0; i < 65; i++) {
			worker.confirm?.(await run(i));
		}
		await run(0);
		expect(last?.headers["if-none-match"]).toBeUndefined();
		await run(64);
		expect(last?.headers["if-none-match"]).toBe('"v1"');
	});

	describe("API key", () => {
		beforeAll(() => {
			process.env.SIGNAL_KEY_TEST = KEY;
		});
		afterAll(() => {
			delete process.env.SIGNAL_KEY_TEST;
		});

		it("goes in the declared header", async () => {
			await fetchPath("/json", { ...QUERY_AUTH, in: "header", name: "x-key" });
			expect(last?.headers["x-key"]).toBe(KEY);
		});

		it("goes in the declared query parameter", async () => {
			await fetchPath("/json", QUERY_AUTH);
			expect(last?.url).toBe(`/json?api_key=${KEY}`);
		});

		it("is in no error: a 401 and a network failure name the host only", async () => {
			const denied = (await fetchPath("/denied", QUERY_AUTH).catch(
				(e: Error) => e
			)) as Error;
			expect(denied.message).toBe(`HTTP 401 from ${new URL(base).host}`);

			const closed = createRestApiWorker("ua")(
				{
					subject: { assetId: "BTC" },
					dimension: "market",
					url: "http://127.0.0.1:1/x",
					params: {},
				},
				QUERY_AUTH
			);
			const failure = (await closed.catch((e: Error) => e)) as Error;
			expect(failure).toBeInstanceOf(Error);
			expect(JSON.stringify([failure.message, failure.stack])).not.toContain(
				KEY
			);
		});
	});
});
