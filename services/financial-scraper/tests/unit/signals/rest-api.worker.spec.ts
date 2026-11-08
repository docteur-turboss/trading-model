import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { createRestApiWorker } from "../../../src/adapters/outbound/signal-sources/rest-api.worker";
import { InvalidPayloadError } from "../../../src/domain/ports/signal-source.port";

/** Answers each path with its status and body; records the last request. */
const ROUTES: Record<string, [number, string]> = {
	"/json": [200, '{"lastPrice":"1.5"}'],
	"/down": [503, "maintenance"],
	"/html": [200, "<!DOCTYPE html><title>moved</title>"],
};

describe("rest_api worker", () => {
	let server: Server;
	let base: string;
	let last: IncomingMessage | undefined;

	beforeAll(async () => {
		server = createServer((req, res) => {
			last = req;
			const [status, body] = ROUTES[req.url ?? ""] ?? [404, ""];
			res.writeHead(status).end(body);
		});
		await new Promise<void>((resolve) => server.listen(0, () => resolve()));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	function fetchPath(path: string) {
		return createRestApiWorker("trading-model-test ops@example.org")({
			subject: { assetId: "BTC" },
			dimension: "market",
			url: `${base}${path}`,
			params: {},
		});
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
});
