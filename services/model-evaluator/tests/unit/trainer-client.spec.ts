import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";

const manifestGet = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: { createWithTls: () => ({ get: manifestGet }) },
}));
jest.mock("@trading-model/http/http-tls-loader", () => ({
	buildHttpsAgentOptions: () => ({}),
}));
jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: async () => ({ host: "trainer", port: 3000 }),
}));
jest.mock("@trading-model/primitives/service-identity", () => ({
	HostPort: {
		toAddress: (t: { host: string; port: number }) => `${t.host}:${t.port}`,
	},
}));

import { ScraperClient } from "../../src/adapters/outbound/scraper-client";
import { TrainerClient } from "../../src/adapters/outbound/trainer-client";

const TLS = { keyPath: "k", certPath: "c", caPath: "ca" } as never;

function answer(
	status: number,
	body: Buffer,
	headers: Record<string, string> = {}
) {
	jest.spyOn(https, "get").mockImplementation(((
		_url: unknown,
		_opts: unknown,
		cb: (res: unknown) => void
	) => {
		const res = Object.assign(new EventEmitter(), {
			statusCode: status,
			headers,
		});
		const req = new EventEmitter();
		setImmediate(() => {
			cb(res);
			res.emit("data", body);
			res.emit("end");
		});
		return req;
	}) as never);
}

describe("TrainerClient", () => {
	it("reads the manifest of a version", async () => {
		const manifest = {
			symbol: "BTCUSDT",
			version: "v1",
			weights: { length: 1, sha256: "a".repeat(64) },
		};
		manifestGet.mockResolvedValue({ data: manifest });
		await expect(
			new TrainerClient(TLS, "/nonexistent").manifest("BTCUSDT", "v1")
		).resolves.toEqual(manifest);
		expect(String(manifestGet.mock.calls[0][0])).toBe(
			"https://trainer:3000/models/BTCUSDT/v1"
		);
	});

	it("returns the weights with their x-model-sha256 header", async () => {
		answer(200, Buffer.from([1, 2, 3, 4]), { "x-model-sha256": "abc" });
		const { bytes, sha256 } = await new TrainerClient(
			TLS,
			"/nonexistent"
		).weights("BTCUSDT", "v1");
		expect([...bytes]).toEqual([1, 2, 3, 4]);
		expect(sha256).toBe("abc");
	});

	it("destroys the request when the weights pass the size cap", async () => {
		const req = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
		req.destroy = jest.fn<(...args: any[]) => any>((err: any) => {
			req.emit("error", err);
		});
		jest.spyOn(https, "get").mockImplementation(((
			_url: unknown,
			_opts: unknown,
			cb: (res: unknown) => void
		) => {
			const res = Object.assign(new EventEmitter(), {
				statusCode: 200,
				headers: {},
			});
			setImmediate(() => {
				cb(res);
				res.emit("data", { length: 256 * 1024 * 1024 + 1 });
			});
			return req;
		}) as never);
		await expect(
			new TrainerClient(TLS, "/nonexistent").weights("BTCUSDT", "v1")
		).rejects.toThrow(/larger than/);
		expect(req.destroy).toHaveBeenCalled();
	});

	it("fails on a 403 from the trainer", async () => {
		answer(403, Buffer.from("{}"));
		await expect(
			new TrainerClient(TLS, "/nonexistent").weights("BTCUSDT", "v1")
		).rejects.toThrow(/HTTP 403/);
	});
});

describe("TrainerClient on the artifact store", () => {
	it("reads manifest and weights from the store with the trainer unreachable", async () => {
		const root = mkdtempSync(join(tmpdir(), "models-"));
		const version = "20261101T000000Z-aaaaaaaaaaaa";
		const dir = join(root, "BTCUSDT", version);
		mkdirSync(dir, { recursive: true });
		const manifest = {
			symbol: "BTCUSDT",
			version,
			weights: { length: 1, sha256: "a".repeat(64) },
			genome: {},
		};
		writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
		writeFileSync(join(dir, "weights.f32"), Buffer.from([1, 2, 3, 4]));
		manifestGet.mockReset();
		jest.spyOn(https, "get").mockImplementation((() => {
			throw new Error("trainer down");
		}) as never);
		const client = new TrainerClient(TLS, root);

		await expect(client.manifest("BTCUSDT", version)).resolves.toEqual(
			manifest
		);
		const { bytes } = await client.weights("BTCUSDT", version);
		expect([...bytes]).toEqual([1, 2, 3, 4]);
		expect(manifestGet).not.toHaveBeenCalled();
	});
});

describe("ScraperClient", () => {
	const row = (minute: number, interval = "1m") => ({
		interval,
		open: 1,
		high: 2,
		low: 0.5,
		close: 1.5,
		volume: 10,
		timestamp: new Date(minute * 60_000).toISOString(),
		closeTimestamp: new Date(minute * 60_000 + 59_999).toISOString(),
	});

	it("reads the window up to `to` exclusive, page after page, one-minute candles once", async () => {
		manifestGet.mockReset();
		manifestGet
			.mockResolvedValueOnce({
				rows: [row(0), row(0), row(1, "1h")],
				nextCursor: "c1",
			})
			.mockResolvedValueOnce({ rows: [row(1)], nextCursor: null });
		const candles = await new ScraperClient(TLS).candles("BTCUSDT", 0, 119_999);

		expect(candles.map((c) => c.timestamp)).toEqual([0, 60_000]);
		expect(String(manifestGet.mock.calls[0][0])).toBe(
			"https://trainer:3000/v2/candles/symbols/BTCUSDT?from=1970-01-01T00:00:00.000Z&to=1970-01-01T00:01:59.999Z&limit=5000"
		);
		expect(String(manifestGet.mock.calls[1][0])).toMatch(/&after=c1$/);
	});
});
