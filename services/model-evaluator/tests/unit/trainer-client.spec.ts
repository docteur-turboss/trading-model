import { EventEmitter } from "node:events";
import https from "node:https";
import { describe, expect, it, jest } from "@jest/globals";

const manifestGet = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/adapters/outbound/http-client", () => ({
	HttpClient: { createWithTls: () => ({ get: manifestGet }) },
}));
jest.mock("@trading-model/http/infrastructure/http-tls-loader", () => ({
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
			new TrainerClient(TLS).manifest("BTCUSDT", "v1")
		).resolves.toEqual(manifest);
		expect(String(manifestGet.mock.calls[0][0])).toBe(
			"https://trainer:3000/models/BTCUSDT/v1"
		);
	});

	it("returns the weights with their x-model-sha256 header", async () => {
		answer(200, Buffer.from([1, 2, 3, 4]), { "x-model-sha256": "abc" });
		const { bytes, sha256 } = await new TrainerClient(TLS).weights(
			"BTCUSDT",
			"v1"
		);
		expect([...bytes]).toEqual([1, 2, 3, 4]);
		expect(sha256).toBe("abc");
	});

	it("fails on a 403 from the trainer", async () => {
		answer(403, Buffer.from("{}"));
		await expect(
			new TrainerClient(TLS).weights("BTCUSDT", "v1")
		).rejects.toThrow(/HTTP 403/);
	});
});
