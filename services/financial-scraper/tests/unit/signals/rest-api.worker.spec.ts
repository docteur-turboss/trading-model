import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { createRestApiWorker } from "../../../src/adapters/outbound/signal-sources/rest-api.worker";
import { InvalidPayloadError } from "../../../src/domain/ports/signal-source.port";
import type { Source } from "../../../src/domain/signals";

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
	"/html": [200, "<!DOCTYPE html><title>moved</title>"],
};

describe("rest_api worker", () => {
	let server: Server;
	let base: string;
	let last: IncomingMessage | undefined;

	beforeAll(async () => {
		server = createServer((req, res) => {
			last = req;
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
		auth: Source["accessPolicy"]["auth"] = "none"
	) {
		return createRestApiWorker("trading-model-test ops@example.org")(
			{
				subject: { assetId: "BTC" },
				dimension: "market",
				url: `${base}${path}`,
				params: {},
			},
			auth
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

	it("rejects with an InvalidPayloadError on a body that is not JSON", async () => {
		await expect(fetchPath("/html")).rejects.toBeInstanceOf(
			InvalidPayloadError
		);
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
