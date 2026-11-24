import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let mockRequestUseHandlers: ((...args: any[]) => any)[] = [];
let mockResponseRejectedHandler: (...args: any[]) => Promise<any>;

jest.mock("axios", () => {
	const mockInstance: any = jest.fn<(...args: any[]) => any>();
	mockInstance.interceptors = {
		request: {
			use: jest.fn((fulfilled: any) => {
				mockRequestUseHandlers.push(fulfilled as any);
			}),
		},
		response: {
			use: jest.fn((_fulfilled: any, rejected: any) => {
				mockResponseRejectedHandler = rejected as any;
			}),
		},
	};
	mockInstance.defaults = {};
	return {
		create: jest.fn((..._args: any[]) => mockInstance),
	};
});

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: { BINANCE_BASE_URL: "http://binance-stub:8080" },
}));

jest.mock("../../../src/config/metrics", () => ({
	BINANCE_REQUESTS_TOTAL: { inc: jest.fn() },
	BINANCE_REQUEST_DURATION_SECONDS: { observe: jest.fn() },
}));

import { createHttpClient } from "../../../src/config/http";
import {
	BINANCE_REQUEST_DURATION_SECONDS,
	BINANCE_REQUESTS_TOTAL,
} from "../../../src/config/metrics";

describe("createHttpClient", () => {
	beforeEach(() => {
		mockRequestUseHandlers = [];
		mockResponseRejectedHandler = undefined as any;
	});

	it("should create axios instance with baseURL and default timeout", () => {
		const axiosMock = jest.requireMock("axios") as {
			create: jest.Mock<(...args: any[]) => any>;
		};
		createHttpClient("https://api.example.com");
		expect(axiosMock.create).toHaveBeenCalledWith({
			baseURL: "https://api.example.com",
			timeout: 7000,
		});
	});

	it("request interceptor should return config with weight", async () => {
		createHttpClient("https://api.example.com");
		const config = { weight: 1 };
		const result = await mockRequestUseHandlers[0](config);
		expect(result).toBe(config);
	});

	it("request interceptor should handle config without weight", async () => {
		createHttpClient("https://api.example.com");
		const config = {};
		const result = await mockRequestUseHandlers[0](config);
		expect(result).toBe(config);
	});

	it("waits the exponential backoff before retrying", async () => {
		createHttpClient("https://api.example.com");
		const axiosMock = jest.requireMock("axios") as {
			create: jest.Mock<(...args: any[]) => any>;
		};
		const instance = axiosMock.create.mock.results.at(-1)?.value as jest.Mock<
			(...args: any[]) => any
		>;
		instance.mockClear();
		jest.useFakeTimers();
		// third retry: 1200 ms base, jitter ±20 % => at least 960 ms; 900 stays below it
		const error = { config: { retryCount: 2 }, response: { status: 500 } };
		const promise = mockResponseRejectedHandler!(error);
		jest.advanceTimersByTime(900);
		await Promise.resolve();
		expect(instance).not.toHaveBeenCalled();
		jest.advanceTimersByTime(20000);
		await promise;
		expect(instance).toHaveBeenCalledTimes(1);
		jest.useRealTimers();
	});

	it("sends no retry once the signal fires, even during the backoff", async () => {
		createHttpClient("https://api.example.com");
		const axiosMock = jest.requireMock("axios") as {
			create: jest.Mock<(...args: any[]) => any>;
		};
		const instance = axiosMock.create.mock.results.at(-1)?.value as jest.Mock<
			(...args: any[]) => any
		>;
		instance.mockClear();
		const abort = new AbortController();
		const error = {
			config: { retryCount: 2, signal: abort.signal },
			response: { status: 500 },
		};
		const promise = mockResponseRejectedHandler!(error);
		abort.abort();
		await expect(promise).rejects.toBe(error);
		expect(instance).not.toHaveBeenCalled();
		expect(() => mockResponseRejectedHandler!(error)).toThrow();
		expect(instance).not.toHaveBeenCalled();
	});

	it("records request count and duration per endpoint outside tests", async () => {
		const axiosMock = jest.requireMock("axios") as {
			create: jest.Mock<(...args: any[]) => any>;
		};
		const nodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		createHttpClient("https://api.example.com");
		process.env.NODE_ENV = nodeEnv;
		const { interceptors } = axiosMock.create.mock.results.at(-1)!.value as any;
		const startTimer = interceptors.request.use.mock.calls.at(-1)[0];
		const [onSuccess, onError] = interceptors.response.use.mock.calls.at(-1);
		const inc = BINANCE_REQUESTS_TOTAL.inc as unknown as jest.Mock;
		const observe =
			BINANCE_REQUEST_DURATION_SECONDS.observe as unknown as jest.Mock;
		inc.mockClear();
		observe.mockClear();

		const ok = startTimer({ url: "/api/v3/klines?symbol=BTCUSDT" });
		const response = { config: ok, status: 200 };
		expect(onSuccess(response)).toBe(response);
		expect(inc).toHaveBeenCalledWith({ endpoint: "klines", status: "200" });

		const failed = startTimer({ url: "/api/v3/trades" });
		const error = { config: failed };
		expect(() => onError(error)).toThrow();
		expect(inc).toHaveBeenCalledWith({
			endpoint: "trades",
			status: "network_error",
		});
		expect(observe).toHaveBeenCalledTimes(2);
		expect(observe).toHaveBeenCalledWith(
			{ endpoint: "klines" },
			expect.any(Number)
		);
	});

	it("response rejected interceptor should not retry on 400", async () => {
		createHttpClient("https://api.example.com");

		const error = { config: { retryCount: 0 }, response: { status: 400 } };
		let threw = false;
		try {
			await mockResponseRejectedHandler!(error);
		} catch {
			threw = true;
		}
		expect(threw).toBe(true);
	});

	it("stamps the deadline once per request and the retry check enforces it", () => {
		jest.useFakeTimers();
		createHttpClient("https://api.example.com");
		const stamp = mockRequestUseHandlers[1];
		const config: any = { retryCount: 1 };
		stamp(config);
		expect(config.deadline).toBe(Date.now() + 45_000);
		jest.advanceTimersByTime(40_000);
		stamp(config);
		expect(config.deadline).toBe(Date.now() + 5000);
		expect(() =>
			mockResponseRejectedHandler!({ config, response: { status: 500 } })
		).toThrow();
		jest.useRealTimers();
	});

	it("stops retrying when the next attempt would end past the deadline", () => {
		createHttpClient("https://api.example.com");
		const error = {
			config: { retryCount: 1, deadline: Date.now() + 5000 },
			response: { status: 500 },
		};
		expect(() => mockResponseRejectedHandler!(error)).toThrow();
		expect(error.config.retryCount).toBe(1);
	});

	it.each([403, 418, 429, 451])(
		"response rejected interceptor should not retry on %i (Binance WAF, IP ban, weight limit, restricted location)",
		async (status) => {
			createHttpClient("https://api.example.com");
			const axiosMock = jest.requireMock("axios") as {
				create: jest.Mock<(...args: any[]) => any>;
			};
			const instance = axiosMock.create.mock.results.at(-1)?.value as jest.Mock<
				(...args: any[]) => any
			>;
			instance.mockClear();

			const error = { config: { retryCount: 0 }, response: { status } };
			let thrown: unknown;
			try {
				await mockResponseRejectedHandler!(error);
			} catch (e) {
				thrown = e;
			}
			expect(thrown).toBe(error);
			expect(instance).not.toHaveBeenCalled();
		}
	);

	it("response rejected interceptor should stop retrying after max retries", async () => {
		createHttpClient("https://api.example.com");

		const error = { config: { retryCount: 5 }, response: { status: 500 } };
		let threw = false;
		try {
			await mockResponseRejectedHandler!(error);
		} catch {
			threw = true;
		}
		expect(threw).toBe(true);
	});

	it("response rejected interceptor should throw when config is missing", async () => {
		createHttpClient("https://api.example.com");

		const error: any = { response: { status: 500 } };
		let threw = false;
		try {
			await mockResponseRejectedHandler!(error);
		} catch {
			threw = true;
		}
		expect(threw).toBe(true);
	});

	it("should build the binance http client on BINANCE_BASE_URL", () => {
		const axiosMock = jest.requireMock("axios") as {
			create: jest.Mock<(...args: any[]) => any>;
		};
		expect(axiosMock.create).toHaveBeenCalledWith({
			baseURL: "http://binance-stub:8080",
			timeout: 7000,
		});
	});
});
