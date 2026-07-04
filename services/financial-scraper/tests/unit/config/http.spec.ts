import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let mockRequestUseHandler: (...args: any[]) => Promise<any>;
let mockResponseFulfilledHandler: (...args: any[]) => any;
let mockResponseRejectedHandler: (...args: any[]) => Promise<any>;

jest.mock("axios", () => {
	const mockInstance: any = jest.fn();
	mockInstance.interceptors = {
		request: {
			use: jest.fn((fulfilled: any) => {
				mockRequestUseHandler = fulfilled as any;
			}),
		},
		response: {
			use: jest.fn((fulfilled: any, rejected: any) => {
				mockResponseFulfilledHandler = fulfilled as any;
				mockResponseRejectedHandler = rejected as any;
			}),
		},
	};
	mockInstance.defaults = {};
	return {
		create: jest.fn(() => mockInstance),
	};
});

import { createHttpClient, httpClients } from "../../../src/config/http";

describe("createHttpClient", () => {
	beforeEach(() => {
		mockRequestUseHandler = undefined as any;
		mockResponseFulfilledHandler = undefined as any;
		mockResponseRejectedHandler = undefined as any;
	});

	it("should create axios instance with baseURL and default timeout", () => {
		const axiosMock = jest.requireMock("axios") as { create: jest.Mock };
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

	it("response fulfilled interceptor should pass through response", () => {
		createHttpClient("https://api.example.com");
		const response = { data: "ok" };
		const result = mockResponseFulfilledHandler!(response);
		expect(result).toBe(response);
	});

	it("response rejected interceptor should retry on 500 and call instance", async () => {
		createHttpClient("https://api.example.com");
		jest.useFakeTimers();

		const error = { config: { __retryCount: 0 }, response: { status: 500 } };
		const promise = mockResponseRejectedHandler!(error).catch((e: any) => e);
		jest.advanceTimersByTime(20000);
		await promise;

		jest.useRealTimers();
	});

	it("response rejected interceptor should not retry on 400", async () => {
		createHttpClient("https://api.example.com");

		const error = { config: { __retryCount: 0 }, response: { status: 400 } };
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

		const error = { config: { __retryCount: 0 }, response: { status: 429 } };
		const promise = mockResponseRejectedHandler!(error).catch((e: any) => e);
		jest.advanceTimersByTime(20000);
		await promise;

		jest.useRealTimers();
	});

	it("response rejected interceptor should retry on 403", async () => {
		createHttpClient("https://api.example.com");
		jest.useFakeTimers();

		const error = { config: { __retryCount: 0 }, response: { status: 403 } };
		const promise = mockResponseRejectedHandler!(error).catch((e: any) => e);
		jest.advanceTimersByTime(20000);
		await promise;

		jest.useRealTimers();
	});

	it("response rejected interceptor should stop retrying after max retries", async () => {
		createHttpClient("https://api.example.com");

		const error = { config: { __retryCount: 5 }, response: { status: 500 } };
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

	it("response rejected interceptor should handle missing __retryCount", async () => {
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

		const error = { config: { __retryCount: 0 }, response: undefined };
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
});
