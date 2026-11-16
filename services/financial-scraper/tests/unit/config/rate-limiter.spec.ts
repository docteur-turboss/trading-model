import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
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
});
