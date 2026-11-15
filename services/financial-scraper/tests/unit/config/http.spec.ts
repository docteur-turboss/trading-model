import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let mockRequestUseHandler: (...args: any[]) => Promise<any>;
let mockResponseRejectedHandler: (...args: any[]) => Promise<any>;

jest.mock("axios", () => {
	const mockInstance: any = jest.fn<(...args: any[]) => any>();
	mockInstance.interceptors = {
		request: {
			use: jest.fn((fulfilled: any) => {
				mockRequestUseHandler = fulfilled as any;
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

import { createHttpClient, httpClients } from "../../../src/config/http";
import {
	BINANCE_REQUEST_DURATION_SECONDS,
	BINANCE_REQUESTS_TOTAL,
} from "../../../src/config/metrics";

describe("createHttpClient", () => {
	beforeEach(() => {
		mockRequestUseHandler = undefined as any;
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
		const result = await mockRequestUseHandler!(config);
		expect(result).toBe(config);
	});

	it("request interceptor should handle config without weight", async () => {
		createHttpClient("https://api.example.com");
		const config = {};
		const result = await mockRequestUseHandler!(config);
		expect(result).toBe(config);
	});

	it("response rejected interceptor should retry on 500 and call instance", async () => {
		createHttpClient("https://api.example.com");
		jest.useFakeTimers();

		const error = { config: { retryCount: 0 }, response: { status: 500 } };
		const promise = mockResponseRejectedHandler!(error).catch((e: any) => e);
		jest.advanceTimersByTime(20000);
		await promise;

		jest.useRealTimers();
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
		// third retry: 300 ms base doubled twice, at least 1200 ms
		const error = { config: { retryCount: 2 }, response: { status: 500 } };
		const promise = mockResponseRejectedHandler!(error);
		jest.advanceTimersByTime(1000);
		await Promise.resolve();
		expect(instance).not.toHaveBeenCalled();
		jest.advanceTimersByTime(20000);
		await promise;
		expect(instance).toHaveBeenCalledTimes(1);
		jest.useRealTimers();
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

	it("response rejected interceptor should retry on 429", async () => {
		createHttpClient("https://api.example.com");
		jest.useFakeTimers();

		const error = { config: { retryCount: 0 }, response: { status: 429 } };
		const promise = mockResponseRejectedHandler!(error).catch((e: any) => e);
		jest.advanceTimersByTime(20000);
		await promise;

		jest.useRealTimers();
	});

	it("should wait for Retry-After on 429 and give up when it exceeds the bound", async () => {
		createHttpClient("https://api.example.com");
		const axiosMock = jest.requireMock("axios") as {
			create: jest.Mock<(...args: any[]) => any>;
		};
		const instance = axiosMock.create.mock.results.at(-1)?.value as jest.Mock<
			(...args: any[]) => any
		>;
		instance.mockClear();
		jest.useFakeTimers();
		const retried = {
			config: { retryCount: 0 },
			response: { status: 429, headers: { "retry-after": "30" } },
		};
		const promise = mockResponseRejectedHandler!(retried);
		jest.advanceTimersByTime(29000);
		await Promise.resolve();
		expect(instance).not.toHaveBeenCalled();
		jest.advanceTimersByTime(2000);
		await promise;
		expect(instance).toHaveBeenCalledTimes(1);
		jest.useRealTimers();

		const tooLong = {
			config: { retryCount: 0 },
			response: { status: 429, headers: { "retry-after": "3600" } },
		};
		expect(() => mockResponseRejectedHandler!(tooLong)).toThrow();
	});

	it.each([403, 418, 451])(
		"response rejected interceptor should not retry on %i (Binance WAF, IP ban, restricted location)",
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

	it("response rejected interceptor should handle missing retryCount", async () => {
		createHttpClient("https://api.example.com");
		jest.useFakeTimers();

		const error = { config: {}, response: { status: 500 } };
		const promise = mockResponseRejectedHandler!(error).catch((e: any) => e);
		jest.advanceTimersByTime(20000);
		await promise;

		jest.useRealTimers();
	});

	it("response rejected interceptor should retry on network error", async () => {
		createHttpClient("https://api.example.com");
		jest.useFakeTimers();

		const error = { config: { retryCount: 0 }, response: undefined };
		const promise = mockResponseRejectedHandler!(error).catch((e: any) => e);
		jest.advanceTimersByTime(20000);
		await promise;

		jest.useRealTimers();
	});

	it("request interceptor should wait when rate limit bucket is empty", async () => {
		createHttpClient("https://api.wait-test.com");

		await mockRequestUseHandler!({ weight: 1200 });

		jest.useFakeTimers();
		const promise = mockRequestUseHandler!({ weight: 1 });
		jest.advanceTimersByTime(50);
		await promise;
		jest.useRealTimers();
	});

	it("should expose pre-built binance http client", () => {
		expect(httpClients.binance).toBeDefined();
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
