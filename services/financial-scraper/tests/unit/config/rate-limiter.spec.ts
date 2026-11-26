import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: { BINANCE_BASE_URL: "http://binance-stub:8080" },
}));

import { AxiosError } from "axios";
import { createHttpClient } from "../../../src/config/http";
import { acquireToken } from "../../../src/config/rate-limiter";

describe("acquireToken", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it("serves a heavy request before the light ones that arrived after it", async () => {
		const url = "https://fifo.test";
		await acquireToken(url, 1195);
		const served: number[] = [];
		const ask = (weight: number) =>
			acquireToken(url, weight).then(() => served.push(weight));
		const all = Promise.all([ask(10), ask(1), ask(1)]);
		await jest.advanceTimersByTimeAsync(2000);
		await all;
		expect(served).toEqual([10, 1, 1]);
	});

	it.each([
		["a success", 200],
		["a 429", 429],
	])(
		"lowers the balance to X-MBX-USED-WEIGHT-1M on %s response",
		async (_n, status) => {
			const url = `https://sync-${status}.test`;
			const headers = { "x-mbx-used-weight-1m": "1190" };
			const client = createHttpClient(url);
			client.defaults.adapter = async (config) => {
				const response = { data: {}, status, statusText: "", headers, config };
				if (status >= 400) {
					throw new AxiosError(
						"limited",
						"ERR_BAD_REQUEST",
						config,
						null,
						response
					);
				}
				return response;
			};
			await client.get("/x").catch(() => undefined);
			let served = false;
			const waiting = acquireToken(url, 100).then(() => {
				served = true;
			});
			await jest.advanceTimersByTimeAsync(1000);
			expect(served).toBe(false);
			await jest.advanceTimersByTimeAsync(4000);
			await waiting;
			expect(served).toBe(true);
		}
	);

	it("rejects a waiting request on abort and lets the next one through", async () => {
		const url = "https://abort.test";
		await acquireToken(url, 1195);
		const abort = new AbortController();
		const waiting = acquireToken(url, 100, abort.signal);
		const rejected = expect(waiting).rejects.toThrow();
		const next = acquireToken(url, 1);
		await jest.advanceTimersByTimeAsync(1000);
		abort.abort();
		await rejected;
		await jest.advanceTimersByTimeAsync(1000);
		await expect(next).resolves.toBeUndefined();
	});
});
