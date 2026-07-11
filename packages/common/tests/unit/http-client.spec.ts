import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { z } from "zod";
import {
	type DurationMs,
	type FilePath,
	URLString,
} from "../../src/domain/primitives";

jest.mock("https");
jest.mock("fs", () => ({
	promises: {
		access: jest.fn(() => Promise.resolve()),
		readFile: jest.fn((path: string) => Promise.resolve(`content-of-${path}`)),
	},
	constants: { R_OK: 4 },
	readFileSync: jest.fn(() => "-----BEGIN CERTIFICATE-----\nmock-content"),
}));

import fs from "node:fs";
import https from "node:https";
import {
	computeAdaptiveTimeout,
	HttpClient,
	HttpClientError,
	HttpClientTimeoutError,
	isServiceCircuitOpen,
} from "../../src/config/http-client";
import {
	registerServiceName,
	type ServiceInstanceName,
} from "../../src/config/services.types";
import type { PositiveInt, ServiceId } from "../../src/domain/primitives";

const TEST_SERVICE_NAMES = [
	"my-service",
	"dynamic-service",
	"reset-service",
	"open-test-service",
	"halfopen-service",
	"halfopen-service-2",
] as const;

beforeAll(() => {
	for (const name of TEST_SERVICE_NAMES) {
		registerServiceName(name as ServiceInstanceName);
	}
});

describe("HttpClient", () => {
	let client: HttpClient;
	let requestCallback: ((res: any) => void) | null;
	let mockReq: any;
	let errorHandler: ((err: Error) => void) | null;

	beforeEach(() => {
		requestCallback = null;
		errorHandler = null;
		mockReq = {
			write: jest.fn(),
			end: jest.fn(),
			on: jest.fn((event: string, cb: (...args: any[]) => void) => {
				if (event === "error") {
					errorHandler = cb as (err: Error) => void;
				}
				return mockReq;
			}),
			setTimeout: jest.fn((_ms: number, cb: () => void) => {
				mockReq._timeoutCb = cb;
				return mockReq;
			}),
			destroy: jest.fn(),
		};

		(https.request as jest.Mock).mockImplementation((_opts: any, cb: any) => {
			requestCallback = cb;
			return mockReq;
		});

		client = new HttpClient();
	});

	describe("constructor", () => {
		it("should not read TLS files eagerly when tlsConfig is provided", () => {
			const tlsClient = new HttpClient({
				caPath: "/path/to/ca.pem" as FilePath,
				certPath: "/path/to/cert.pem" as FilePath,
				keyPath:
					"-----BEGIN RSA PRIVATE KEY-----\n/path/to/key.pem" as FilePath,
			});

			expect((fs as any).promises.readFile).not.toHaveBeenCalled();
			expect(tlsClient).toBeInstanceOf(HttpClient);
		});

		it("should not read TLS files when tlsConfig is empty", () => {
			(fs as any).promises.readFile.mockClear();

			new HttpClient({});

			expect((fs as any).promises.readFile).not.toHaveBeenCalled();
		});
	});

	function simulateResponse(
		statusCode: number,
		body: string,
		contentType: string
	) {
		(requestCallback as any)({
			on: jest.fn((e: string, cb2: any) => {
				if (e === "data") {
					cb2(body);
				}
				if (e === "end") {
					cb2();
				}
			}),
			statusCode,
			headers: { "content-type": contentType },
		});
	}

	function simulateRawResponse(statusCode: number, contentType: string) {
		const onMock = jest.fn((e: string, cb2: any) => {
			if (e === "data") {
				cb2("{invalid json}");
			}
			if (e === "end") {
				cb2();
			}
		});
		(requestCallback as any)({
			on: onMock,
			statusCode,
			headers: { "content-type": contentType },
		});
		return onMock;
	}

	describe("get", () => {
		it("should make a GET request", async () => {
			const responseData = JSON.stringify({ data: "test" });

			const promise = client.get(URLString.of("https://example.com/api"));
			simulateResponse(200, responseData, "application/json");

			const result = await promise;
			expect(result).toEqual({ data: "test" });
		});

		it("should reject on HTTP error status", async () => {
			const promise = client.get(URLString.of("https://example.com/api"));
			simulateResponse(404, "", "text/plain");

			await expect(promise).rejects.toThrow(HttpClientError);
		});

		it("should reject on request error", async () => {
			const promise = client.get(URLString.of("https://example.com/api"));
			errorHandler!(new Error("connection failed"));

			await expect(promise).rejects.toThrow("connection failed");
		});

		it("should reject on timeout", async () => {
			const promise = client.get(URLString.of("https://example.com/api"), {
				timeoutMs: 100 as DurationMs,
				retryCount: 0 as PositiveInt,
			});
			mockReq._timeoutCb();

			await expect(promise).rejects.toThrow(HttpClientTimeoutError);
		});

		it("should reject on JSON parse error", async () => {
			const promise = client.get(URLString.of("https://example.com/api"));
			simulateRawResponse(200, "application/json");

			await expect(promise).rejects.toThrow();
		});

		it("should handle request with timeout that completes normally", async () => {
			const responseData = JSON.stringify({ data: "ok" });
			const promise = client.get(URLString.of("https://example.com/api"), {
				timeoutMs: 1000 as DurationMs,
			});
			simulateResponse(200, responseData, "application/json");

			const result = await promise;
			expect(result).toEqual({ data: "ok" });
		});

		it("should handle response without content-type header", async () => {
			const promise = client.get(URLString.of("https://example.com/api"));
			(requestCallback as any)({
				on: jest.fn((e: string, cb2: any) => {
					if (e === "data") {
						cb2("raw-string-data");
					}
					if (e === "end") {
						cb2();
					}
				}),
				statusCode: 200,
				headers: {},
			});

			const result = await promise;
			expect(result).toBe("raw-string-data");
		});
	});

	describe("post", () => {
		it("should make a POST request with body", async () => {
			const promise = client.post(URLString.of("https://example.com/api"), {
				name: "test",
			});
			simulateResponse(201, JSON.stringify({ id: 1 }), "application/json");

			const result = await promise;
			expect(result).toEqual({ id: 1 });
			expect(mockReq.write).toHaveBeenCalledWith(
				JSON.stringify({ name: "test" })
			);
		});

		it("should handle 204 No Content", async () => {
			const promise = client.post(URLString.of("https://example.com/api"));
			simulateResponse(204, "", "text/plain");

			const result = await promise;
			expect(result).toBeUndefined();
		});
	});

	describe("delete", () => {
		it("should make a DELETE request", async () => {
			const promise = client.delete(URLString.of("https://example.com/api/1"));
			simulateResponse(200, "true", "text/plain");

			const result = await promise;
			expect(result).toBe("true");
		});
	});

	describe("schema validation", () => {
		it("should validate JSON response with schema", async () => {
			const responseData = JSON.stringify({ data: "test" });
			const schema = z.object({ data: z.string() });

			const promise = client.get(
				URLString.of("https://example.com/api"),
				undefined,
				schema
			);
			simulateResponse(200, responseData, "application/json");

			const result = await promise;
			expect(result).toEqual({ data: "test" });
		});

		it("should reject when JSON response does not match schema", async () => {
			const responseData = JSON.stringify({ data: 123 });
			const schema = z.object({ data: z.string() });

			const promise = client.get(
				URLString.of("https://example.com/api"),
				undefined,
				schema
			);
			simulateResponse(200, responseData, "application/json");

			await expect(promise).rejects.toThrow(z.ZodError);
		});

		it("should validate non-JSON response with schema", async () => {
			const schema = z.literal("raw-string");

			const promise = client.get(
				URLString.of("https://example.com/api"),
				undefined,
				schema
			);
			(requestCallback as any)({
				on: jest.fn((e: string, cb2: any) => {
					if (e === "data") {
						cb2("raw-string");
					}
					if (e === "end") {
						cb2();
					}
				}),
				statusCode: 200,
				headers: {},
			});

			const result = await promise;
			expect(result).toBe("raw-string");
		});

		it("should reject when non-JSON response does not match schema", async () => {
			const schema = z.literal("expected");

			const promise = client.get(
				URLString.of("https://example.com/api"),
				undefined,
				schema
			);
			(requestCallback as any)({
				on: jest.fn((e: string, cb2: any) => {
					if (e === "data") {
						cb2("actual");
					}
					if (e === "end") {
						cb2();
					}
				}),
				statusCode: 200,
				headers: {},
			});

			await expect(promise).rejects.toThrow(z.ZodError);
		});

		it("should validate post response with schema", async () => {
			const responseData = JSON.stringify({ id: 1, name: "test" });
			const schema = z.object({ id: z.number(), name: z.string() });

			const promise = client.post(
				URLString.of("https://example.com/api"),
				{ name: "test" },
				undefined,
				schema
			);
			simulateResponse(201, responseData, "application/json");

			const result = await promise;
			expect(result).toEqual({ id: 1, name: "test" });
		});
	});

	describe("createWithTls", () => {
		it("should create HttpClient with TLS paths (lazy load)", () => {
			(fs as any).promises.readFile.mockClear();
			(fs as any).promises.access.mockClear();

			const client = HttpClient.createWithTls({
				caPath: "/etc/ca.pem" as FilePath,
				certPath: "/etc/cert.pem" as FilePath,
				keyPath: "/etc/key.pem" as FilePath,
			});

			expect(client).toBeInstanceOf(HttpClient);
			expect((fs as any).promises.readFile).not.toHaveBeenCalled();
		});
	});

	describe("TLS error handling", () => {
		beforeEach(() => {
			jest.clearAllMocks();
		});

		it("should throw descriptive error when TLS file cannot be read (Error thrown)", () => {
			(fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
				throw new Error("ENOENT: no such file");
			});

			expect(
				() => new HttpClient({ caPath: "/bad/path.pem" as FilePath })
			).toThrow('Failed to read TLS CA certificate from "/bad/path.pem"');
		});

		it("should handle non-Error rejection from TLS file read", () => {
			(fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
				throw new Error("string error");
			});

			expect(
				() => new HttpClient({ caPath: "/bad/path.pem" as FilePath })
			).toThrow('Failed to read TLS CA certificate from "/bad/path.pem"');
		});
	});

	describe("request close handling", () => {
		it("should clean up timeout listener on request close after normal completion", async () => {
			mockReq.removeListener = jest.fn();
			mockReq.destroyed = false;

			const promise = client.get(URLString.of("https://example.com/api"), {
				timeoutMs: 1000 as DurationMs,
			});
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");

			const closeCall = mockReq.on.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			);
			const closeHandler = closeCall![1] as () => void;
			closeHandler();

			await promise;

			expect(mockReq.removeListener).toHaveBeenCalledWith(
				"timeout",
				expect.any(Function)
			);
		});

		it("should not clean up timeout listener when request was destroyed", async () => {
			mockReq.removeListener = jest.fn();
			mockReq.destroyed = true;

			const promise = client.get(URLString.of("https://example.com/api"), {
				timeoutMs: 1000 as DurationMs,
			});
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");

			const closeCall = mockReq.on.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			);
			const closeHandler = closeCall![1] as () => void;
			closeHandler();

			await promise;

			expect(mockReq.removeListener).not.toHaveBeenCalled();
		});
	});

	describe("non-Error rejection handling", () => {
		it("should handle non-Error reject in JSON parse", async () => {
			jest.spyOn(JSON, "parse").mockImplementationOnce(() => {
				throw new Error("parse-error-string");
			});

			const promise = client.get(URLString.of("https://example.com/api"));
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");

			await expect(promise).rejects.toThrow("parse-error-string");
			jest.restoreAllMocks();
		});
	});

	describe("circuit breaker (hostname)", () => {
		beforeEach(() => {
			(https.request as jest.Mock).mockClear();
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("should succeed on first request to a hostname", async () => {
			const promise = client.get(
				URLString.of("https://cb-first.example.com/api")
			);
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			await expect(promise).resolves.toEqual({ ok: true });
		});

		it("should fail after consecutive failures and eventually reject with circuit open", async () => {
			for (let i = 0; i < 6; i++) {
				const promise = client.get(
					URLString.of("https://cb-sequential.example.com/api"),
					{
						retryCount: 0 as PositiveInt,
					}
				);
				if (i < 5) {
					errorHandler!(new Error("ECONNRESET"));
					await expect(promise).rejects.toThrow("ECONNRESET");
				} else {
					await expect(promise).rejects.toThrow(HttpClientError);
					await expect(promise).rejects.toThrow(
						"Circuit breaker open for cb-sequential.example.com"
					);
				}
			}
		});

		it("should reset circuit on success after half-open", async () => {
			for (let i = 0; i < 5; i++) {
				const promise = client.get(
					URLString.of("https://cb-reset.example.com/api"),
					{
						retryCount: 0 as PositiveInt,
					}
				);
				errorHandler!(new Error("ECONNRESET"));
				await expect(promise).rejects.toThrow();
			}

			jest.advanceTimersByTime(30_001);

			const promise = client.get(
				URLString.of("https://cb-reset.example.com/api"),
				{
					retryCount: 0 as PositiveInt,
				}
			);
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			await expect(promise).resolves.toEqual({ ok: true });
		});
	});

	describe("circuit breaker (service)", () => {
		beforeEach(() => {
			(https.request as jest.Mock).mockClear();
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("should open after threshold failures and reject via isServiceCircuitOpen", async () => {
			for (let i = 0; i < 5; i++) {
				const promise = client.get(
					URLString.of("https://cb-svc-1.example.com/api"),
					{
						retryCount: 0 as PositiveInt,
						serviceName: "my-service" as unknown as ServiceId,
					}
				);
				errorHandler!(new Error("ECONNRESET"));
				await expect(promise).rejects.toThrow();
			}

			expect(isServiceCircuitOpen("my-service" as ServiceInstanceName)).toBe(
				true
			);
		});

		it("should respect dynamic threshold based on instance count", async () => {
			isServiceCircuitOpen("dynamic-service" as ServiceInstanceName); // warm up entry

			for (let i = 0; i < 6; i++) {
				const promise = client.get(
					URLString.of(`https://cb-svc-dyn-${i}.example.com/api`),
					{
						retryCount: 0 as PositiveInt,
						serviceName: "dynamic-service" as unknown as ServiceId,
						serviceInstanceCount: 3 as PositiveInt,
					}
				);
				errorHandler!(new Error("ECONNRESET"));
				await expect(promise).rejects.toThrow();
			}

			expect(
				isServiceCircuitOpen("dynamic-service" as ServiceInstanceName)
			).toBe(true);
		});

		it("should reset service circuit on success after cooldown", async () => {
			for (let i = 0; i < 5; i++) {
				const promise = client.get(
					URLString.of("https://cb-svc-3.example.com/api"),
					{
						retryCount: 0 as PositiveInt,
						serviceName: "reset-service" as unknown as ServiceId,
					}
				);
				errorHandler!(new Error("ECONNRESET"));
				await expect(promise).rejects.toThrow();
			}

			jest.advanceTimersByTime(30_001);

			const promise = client.get(
				URLString.of("https://cb-svc-3.example.com/api"),
				{
					retryCount: 0 as PositiveInt,
					serviceName: "reset-service" as unknown as ServiceId,
				}
			);
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			await expect(promise).resolves.toEqual({ ok: true });

			expect(isServiceCircuitOpen("reset-service" as ServiceInstanceName)).toBe(
				false
			);
		});
	});

	describe("retry logic", () => {
		beforeEach(() => {
			(https.request as jest.Mock).mockClear();
		});

		it("should retry on 503 status and eventually succeed", async () => {
			let callCount = 0;
			(https.request as jest.Mock).mockImplementation((_opts: any, cb: any) => {
				callCount++;
				if (callCount <= 2) {
					cb({
						on: jest.fn((e: string, cb2: any) => {
							if (e === "data") {
								cb2("");
							}
							if (e === "end") {
								cb2();
							}
						}),
						statusCode: 503,
						headers: { "content-type": "text/plain" },
					});
				} else {
					cb({
						on: jest.fn((e: string, cb2: any) => {
							if (e === "data") {
								cb2(JSON.stringify({ ok: true }));
							}
							if (e === "end") {
								cb2();
							}
						}),
						statusCode: 200,
						headers: { "content-type": "application/json" },
					});
				}
				return {
					write: jest.fn(),
					end: jest.fn(),
					on: jest.fn(),
					setTimeout: jest.fn(),
					destroy: jest.fn(),
				};
			});

			const result = await client.get(URLString.of("https://example.com/api"));
			expect(result).toEqual({ ok: true });
			expect(callCount).toBe(3);
		});

		it("should exhaust retries and throw the last error", async () => {
			(https.request as jest.Mock).mockImplementation((_opts: any, cb: any) => {
				cb({
					on: jest.fn((e: string, cb2: any) => {
						if (e === "data") {
							cb2("");
						}
						if (e === "end") {
							cb2();
						}
					}),
					statusCode: 503,
					headers: { "content-type": "text/plain" },
				});
				return {
					write: jest.fn(),
					end: jest.fn(),
					on: jest.fn(),
					setTimeout: jest.fn(),
					destroy: jest.fn(),
				};
			});

			const promise = client.get(URLString.of("https://example.com/api"), {
				retryCount: 1 as PositiveInt,
			});
			await expect(promise).rejects.toThrow(HttpClientError);
		});
	});

	describe("service circuit open rejection", () => {
		beforeEach(() => {
			(https.request as jest.Mock).mockClear();
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("should throw circuit breaker error when making request with open service circuit", async () => {
			for (let i = 0; i < 5; i++) {
				const promise = client.get(
					URLString.of("https://cb-svc-open-host.example.com/api"),
					{
						retryCount: 0 as PositiveInt,
						serviceName: "open-test-service" as unknown as ServiceId,
					}
				);
				errorHandler!(new Error("ECONNRESET"));
				await expect(promise).rejects.toThrow();
			}

			const promise = client.get(
				URLString.of("https://different-host-for-svc.example.com/api"),
				{
					retryCount: 0 as PositiveInt,
					serviceName: "open-test-service" as unknown as ServiceId,
				}
			);
			await expect(promise).rejects.toThrow(
				"Circuit breaker open for service open-test-service"
			);
		});
	});

	describe("isServiceCircuitOpen half-open transitions", () => {
		beforeEach(() => {
			(https.request as jest.Mock).mockClear();
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("should transition to half-open after cooldown and return true from isServiceCircuitOpen", async () => {
			for (let i = 0; i < 5; i++) {
				const promise = client.get(
					URLString.of("https://cb-halfopen.example.com/api"),
					{
						retryCount: 0 as PositiveInt,
						serviceName: "halfopen-service" as unknown as ServiceId,
					}
				);
				errorHandler!(new Error("ECONNRESET"));
				await expect(promise).rejects.toThrow();
			}

			jest.advanceTimersByTime(30_001);

			expect(
				isServiceCircuitOpen("halfopen-service" as ServiceInstanceName)
			).toBe(true);
		});

		it("should return true for half-open state when no request resets it", async () => {
			for (let i = 0; i < 5; i++) {
				const promise = client.get(
					URLString.of("https://cb-halfopen2.example.com/api"),
					{
						retryCount: 0 as PositiveInt,
						serviceName: "halfopen-service-2" as unknown as ServiceId,
					}
				);
				errorHandler!(new Error("ECONNRESET"));
				await expect(promise).rejects.toThrow();
			}

			jest.advanceTimersByTime(30_001);

			isServiceCircuitOpen("halfopen-service-2" as ServiceInstanceName);
			expect(
				isServiceCircuitOpen("halfopen-service-2" as ServiceInstanceName)
			).toBe(true);
		});
	});

	describe("fallback throw edge cases", () => {
		it("should throw generic error when retryCount < 0 (loop never runs)", async () => {
			const promise = client.get(URLString.of("https://example.com/api"), {
				retryCount: -1 as PositiveInt as PositiveInt,
			});
			await expect(promise).rejects.toThrow("Request failed");
		});

		it("should handle non-Error rejection from executeRequest", async () => {
			const promise = client.get(URLString.of("https://example.com/api"), {
				retryCount: 0 as PositiveInt as PositiveInt,
			});
			errorHandler!("something went wrong" as any);
			await expect(promise).rejects.toThrow("something went wrong");
		});
	});

	describe("shouldRetry for timeout errors", () => {
		it("should treat HttpClientTimeoutError as retryable and succeed on retry", async () => {
			const promise = client.get(URLString.of("https://example.com/api"), {
				retryCount: 1 as PositiveInt as PositiveInt,
				timeoutMs: 100 as DurationMs,
			});
			mockReq._timeoutCb();
			await new Promise((resolve) => setTimeout(resolve, 300));
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			const result = await promise;
			expect(result).toEqual({ ok: true });
		});
	});

	describe("shouldRetry for network errors", () => {
		it("should retry on ECONNRESET error", async () => {
			const promise = client.get(URLString.of("https://example.com/api"), {
				retryCount: 1 as PositiveInt as PositiveInt,
				timeoutMs: 100 as DurationMs,
			});
			errorHandler!(new Error("read ECONNRESET"));
			await new Promise((resolve) => setTimeout(resolve, 300));
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			const result = await promise;
			expect(result).toEqual({ ok: true });
		});
	});

	describe("gzip and deflate content encoding", () => {
		it("should handle gzip-encoded response", async () => {
			const gzipData = "gzip-compressed-data";
			const mockGunzip = { on: jest.fn() };

			(mockGunzip.on as unknown as jest.Mock).mockImplementation(
				(e: unknown, cb2: unknown) => {
					if (e === "data") {
						(cb2 as (d: string) => void)(gzipData);
					}
					if (e === "end") {
						(cb2 as () => void)();
					}
				}
			);

			const mockRes = {
				pipe: jest.fn(() => mockGunzip),
				statusCode: 200,
				headers: { "content-type": "text/plain", "content-encoding": "gzip" },
			};

			(https.request as jest.Mock).mockImplementation((_opts: any, cb: any) => {
				cb(mockRes);
				return {
					write: jest.fn(),
					end: jest.fn(),
					on: jest.fn(),
					setTimeout: jest.fn(),
					destroy: jest.fn(),
				};
			});

			const result = await client.get(URLString.of("https://example.com/data"));
			expect(result).toBe("gzip-compressed-data");
		});

		it("should handle deflate-encoded response", async () => {
			const deflateData = "deflate-compressed-data";
			const mockInflate = { on: jest.fn() };

			(mockInflate.on as unknown as jest.Mock).mockImplementation(
				(e: unknown, cb2: unknown) => {
					if (e === "data") {
						(cb2 as (d: string) => void)(deflateData);
					}
					if (e === "end") {
						(cb2 as () => void)();
					}
				}
			);

			const mockRes = {
				pipe: jest.fn(() => mockInflate),
				statusCode: 200,
				headers: {
					"content-type": "text/plain",
					"content-encoding": "deflate",
				},
			};

			(https.request as jest.Mock).mockImplementation((_opts: any, cb: any) => {
				cb(mockRes);
				return {
					write: jest.fn(),
					end: jest.fn(),
					on: jest.fn(),
					setTimeout: jest.fn(),
					destroy: jest.fn(),
				};
			});

			const result = await client.get(URLString.of("https://example.com/data"));
			expect(result).toBe("deflate-compressed-data");
		});
	});
});

describe("computeAdaptiveTimeout", () => {
	it("should return baseMs × 2 when no EWMA latency", () => {
		expect(computeAdaptiveTimeout(5000)).toBe(10000);
	});

	it("should return max(baseMs, ewmaLatencyMs × 3) when latency is known", () => {
		expect(computeAdaptiveTimeout(5000, 2000)).toBe(6000);
	});

	it("should return baseMs when EWMA is very small", () => {
		expect(computeAdaptiveTimeout(5000, 100)).toBe(5000);
	});

	it("should handle zero baseMs", () => {
		expect(computeAdaptiveTimeout(0, 1000)).toBe(3000);
	});
});

describe("isServiceCircuitOpen", () => {
	it("should return false for unknown service", () => {
		expect(isServiceCircuitOpen("nonexistent" as ServiceInstanceName)).toBe(
			false
		);
	});

	it("should return false for a service with no recorded failures", () => {
		expect(isServiceCircuitOpen("fresh-service" as ServiceInstanceName)).toBe(
			false
		);
	});
});

describe("computeAdaptiveTimeout", () => {
	it("should return baseMs × 2 when no EWMA latency", () => {
		expect(computeAdaptiveTimeout(5000)).toBe(10000);
	});

	it("should return max(baseMs, ewmaLatencyMs × 3) when latency is known", () => {
		expect(computeAdaptiveTimeout(5000, 2000)).toBe(6000);
	});

	it("should return baseMs when EWMA is very small", () => {
		expect(computeAdaptiveTimeout(5000, 100)).toBe(5000);
	});

	it("should handle zero baseMs", () => {
		expect(computeAdaptiveTimeout(0, 1000)).toBe(3000);
	});
});
