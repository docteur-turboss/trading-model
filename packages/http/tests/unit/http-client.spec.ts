import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import type { CorrelationId } from "@trading-model/primitives/primitives";
import {
	type DurationMs,
	type FilePath,
	URLString,
} from "@trading-model/primitives/primitives";
import { z } from "zod";
import { circuitBreakerRejectionsTotal } from "../../src/infrastructure/outbound-metrics";

jest.mock("https");
jest.mock("fs", () => ({
	promises: {
		access: jest.fn((..._args: any[]) => Promise.resolve()),
		readFile: jest.fn((path: string) => Promise.resolve(`content-of-${path}`)),
	},
	constants: { R_OK: 4 },
	readFileSync: jest.fn(
		(..._args: any[]) => "-----BEGIN CERTIFICATE-----\nmock-content"
	),
	statSync: jest.fn((..._args: any[]) => ({ mtimeMs: 1, ino: 1, size: 1 })),
}));

jest.mock("@opentelemetry/api", () => {
	const actual =
		jest.requireActual<typeof import("@opentelemetry/api")>(
			"@opentelemetry/api"
		);
	return {
		...actual,
		context: {
			...actual.context,
			active: jest.fn((..._args: any[]) => actual.ROOT_CONTEXT),
		},
		propagation: {
			...actual.propagation,
			inject: jest.fn((_ctx: unknown, carrier: Record<string, string>) => {
				carrier.traceparent =
					"00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
			}),
		},
	};
});

import fs from "node:fs";
import https from "node:https";
import {
	registerServiceName,
	type ServiceInstanceName,
} from "@trading-model/common/config/services.types";
import { runWithCorrelationId } from "@trading-model/http/adapters/inbound/correlation-id";
import { getDefaultCircuitRecorder } from "@trading-model/http/adapters/outbound/circuit-recorder";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import type {
	PositiveInt,
	ServiceId,
} from "@trading-model/primitives/primitives";

const isServiceCircuitOpen = (name: ServiceInstanceName) =>
	getDefaultCircuitRecorder().isServiceCircuitOpen(name);

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
	let lastRequestOptions: any;

	beforeEach(() => {
		requestCallback = null;
		errorHandler = null;
		lastRequestOptions = null;
		mockReq = {
			write: jest.fn<(...args: any[]) => any>(),
			end: jest.fn<(...args: any[]) => any>(),
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
			destroy: jest.fn<(...args: any[]) => any>(),
		};

		(https.request as jest.Mock<(...args: any[]) => any>).mockImplementation(
			(opts: any, cb: any) => {
				requestCallback = cb;
				lastRequestOptions = opts;
				return mockReq;
			}
		);

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

	describe("outgoing propagation", () => {
		it("should inject x-correlation-id from the async context", async () => {
			const promise: Promise<void> = runWithCorrelationId(
				"corr-123" as CorrelationId,
				() => client.get(URLString.of("https://example.com/api"))
			);
			simulateResponse(200, "{}", "application/json");

			await promise;

			expect(lastRequestOptions.headers[HTTP_HEADERS.CORRELATION_ID]).toBe(
				"corr-123"
			);
		});

		it("should prefer an explicit x-correlation-id header over the context", async () => {
			const promise: Promise<void> = runWithCorrelationId(
				"ctx-id" as CorrelationId,
				() =>
					client.get(URLString.of("https://example.com/api"), {
						headers: { [HTTP_HEADERS.CORRELATION_ID]: "explicit-id" },
					})
			);
			simulateResponse(200, "{}", "application/json");

			await promise;

			expect(lastRequestOptions.headers[HTTP_HEADERS.CORRELATION_ID]).toBe(
				"explicit-id"
			);
		});

		it("should inject a W3C traceparent header from the active span context", async () => {
			const promise = client.get(URLString.of("https://example.com/api"));
			simulateResponse(200, "{}", "application/json");

			await promise;

			expect(lastRequestOptions.headers.traceparent).toBe(
				"00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
			);
		});
	});

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

			await expect(promise).rejects.toMatchObject({ name: "HttpClientError" });
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
			promise.catch(() => undefined);
			await new Promise((resolve) => setTimeout(resolve, 150));

			await expect(promise).rejects.toMatchObject({
				name: "HttpClientTimeoutError",
			});
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

		it("should send bigint values as decimal strings and Sets as arrays", async () => {
			const promise = client.post(URLString.of("https://example.com/api"), {
				tradeId: 9007199254740993n,
				bids: new Set([{ price: 1 }]),
			});
			simulateResponse(204, "", "text/plain");

			await promise;
			expect(mockReq.write).toHaveBeenCalledWith(
				'{"tradeId":"9007199254740993","bids":[{"price":1}]}'
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
			(
				fs.readFileSync as jest.Mock<(...args: any[]) => any>
			).mockImplementationOnce(() => {
				throw new Error("ENOENT: no such file");
			});

			expect(
				() => new HttpClient({ caPath: "/bad/path.pem" as FilePath })
			).toThrow('Failed to read TLS CA certificate from "/bad/path.pem"');
		});

		it("should handle non-Error rejection from TLS file read", () => {
			(
				fs.readFileSync as jest.Mock<(...args: any[]) => any>
			).mockImplementationOnce(() => {
				throw new Error("string error");
			});

			expect(
				() => new HttpClient({ caPath: "/bad/path.pem" as FilePath })
			).toThrow('Failed to read TLS CA certificate from "/bad/path.pem"');
		});
	});

	describe("TLS reload", () => {
		it("should not re-read TLS files per request (cached, see http-tls-loader.spec)", async () => {
			const tlsClient = new HttpClient({
				caPath: "/etc/ca.pem" as FilePath,
				certPath: "/etc/cert.pem" as FilePath,
				keyPath: "/etc/key.pem" as FilePath,
			});
			(fs.readFileSync as jest.Mock<(...args: any[]) => any>).mockClear();

			const promise = tlsClient.get(URLString.of("https://example.com/api"));
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			await promise;

			expect(fs.readFileSync).not.toHaveBeenCalled();
		});
	});

	describe("request close handling", () => {
		it("should clear the deadline timer when the request closes", async () => {
			const clearSpy = jest.spyOn(global, "clearTimeout");
			const promise = client.get(URLString.of("https://example.com/api"), {
				timeoutMs: 1000 as DurationMs,
			});
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			const closeCall = mockReq.on.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			);
			(closeCall![1] as () => void)();
			await promise;
			expect(clearSpy).toHaveBeenCalled();
			clearSpy.mockRestore();
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
			(https.request as jest.Mock<(...args: any[]) => any>).mockClear();
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
					await expect(promise).rejects.toMatchObject({
						name: "HttpClientError",
					});
					await expect(promise).rejects.toThrow(
						"Circuit breaker open for cb-sequential.example.com"
					);
					const { values } = await circuitBreakerRejectionsTotal.get();
					expect(values).toContainEqual(
						expect.objectContaining({
							labels: { target: "cb-sequential.example.com", kind: "hostname" },
							value: 1,
						})
					);
				}
			}
		});

		it("should not open the circuit on 4xx responses", async () => {
			for (let i = 0; i < 6; i++) {
				const promise = client.get(
					URLString.of("https://cb-4xx.example.com/api"),
					{ retryCount: 0 as PositiveInt }
				);
				simulateResponse(404, "{}", "application/json");
				await expect(promise).rejects.not.toThrow("Circuit breaker open");
			}
		});

		it("should open the circuit on socket errors outside the retry list", async () => {
			for (let i = 0; i < 6; i++) {
				const promise = client.get(
					URLString.of("https://cb-unreach.example.com/api"),
					{ retryCount: 0 as PositiveInt }
				);
				if (i < 5) {
					errorHandler!(new Error("EHOSTUNREACH"));
					await expect(promise).rejects.toThrow("EHOSTUNREACH");
				} else {
					await expect(promise).rejects.toThrow("Circuit breaker open");
				}
			}
		});

		it("should reopen the circuit on a half-open failure", async () => {
			const url = URLString.of("https://cb-reopen.example.com/api");
			const opts = { retryCount: 0 as PositiveInt };
			for (let i = 0; i < 5; i++) {
				const promise = client.get(url, opts);
				errorHandler!(new Error("ECONNRESET"));
				await expect(promise).rejects.toThrow("ECONNRESET");
			}
			jest.advanceTimersByTime(30_001);
			const probe = client.get(url, opts);
			errorHandler!(new Error("ECONNRESET"));
			await expect(probe).rejects.toThrow("ECONNRESET");

			(https.request as jest.Mock<(...args: any[]) => any>).mockClear();
			await expect(client.get(url, opts)).rejects.toThrow(
				"Circuit breaker open for cb-reopen.example.com"
			);
			expect(https.request).not.toHaveBeenCalled();
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
			(https.request as jest.Mock<(...args: any[]) => any>).mockClear();
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
			(https.request as jest.Mock<(...args: any[]) => any>).mockClear();
		});

		it("should retry on 503 status and eventually succeed", async () => {
			let callCount = 0;
			(https.request as jest.Mock<(...args: any[]) => any>).mockImplementation(
				(_opts: any, cb: any) => {
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
						write: jest.fn<(...args: any[]) => any>(),
						end: jest.fn<(...args: any[]) => any>(),
						on: jest.fn<(...args: any[]) => any>(),
						setTimeout: jest.fn<(...args: any[]) => any>(),
						destroy: jest.fn<(...args: any[]) => any>(),
					};
				}
			);

			const result = await client.get(URLString.of("https://example.com/api"));
			expect(result).toEqual({ ok: true });
			expect(callCount).toBe(3);
		});

		it("should exhaust retries and throw the last error", async () => {
			(https.request as jest.Mock<(...args: any[]) => any>).mockImplementation(
				(_opts: any, cb: any) => {
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
						write: jest.fn<(...args: any[]) => any>(),
						end: jest.fn<(...args: any[]) => any>(),
						on: jest.fn<(...args: any[]) => any>(),
						setTimeout: jest.fn<(...args: any[]) => any>(),
						destroy: jest.fn<(...args: any[]) => any>(),
					};
				}
			);

			const promise = client.get(URLString.of("https://example.com/api"), {
				retryCount: 1 as PositiveInt,
			});
			await expect(promise).rejects.toMatchObject({ name: "HttpClientError" });
		});
	});

	describe("service circuit open rejection", () => {
		beforeEach(() => {
			(https.request as jest.Mock<(...args: any[]) => any>).mockClear();
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
			(https.request as jest.Mock<(...args: any[]) => any>).mockClear();
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
			jest.useFakeTimers();
			const promise = client.get(URLString.of("https://example.com/api"), {
				retryCount: 1 as PositiveInt as PositiveInt,
				timeoutMs: 100 as DurationMs,
			});
			await jest.advanceTimersToNextTimerAsync();
			await jest.advanceTimersToNextTimerAsync();
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			const result = await promise;
			expect(result).toEqual({ ok: true });
			jest.useRealTimers();
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

	describe("POST: not idempotent unless marked", () => {
		beforeEach(() => {
			(https.request as jest.Mock<(...args: any[]) => any>).mockClear();
		});

		it("should not re-send a request that timed out", async () => {
			const promise = client.post(
				URLString.of("https://example.com/api"),
				{},
				{ retryCount: 1, timeoutMs: 100 as DurationMs }
			);
			promise.catch(() => undefined);
			await new Promise((resolve) => setTimeout(resolve, 150));
			await expect(promise).rejects.toThrow("timed out");
			expect(https.request).toHaveBeenCalledTimes(1);
		});

		it("should retry a refused connection: the request never left", async () => {
			const promise = client.post(
				URLString.of("https://example.com/api"),
				{},
				{ retryCount: 1, timeoutMs: 100 as DurationMs }
			);
			errorHandler!(new Error("connect ECONNREFUSED 10.0.0.1:3000"));
			await new Promise((resolve) => setTimeout(resolve, 300));
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			await expect(promise).resolves.toEqual({ ok: true });
			expect(https.request).toHaveBeenCalledTimes(2);
		});

		it("should re-send a timed-out request marked idempotent", async () => {
			jest.useFakeTimers();
			const promise = client.post(
				URLString.of("https://example.com/api"),
				{},
				{ retryCount: 1, idempotent: true, timeoutMs: 100 as DurationMs }
			);
			await jest.advanceTimersToNextTimerAsync();
			await jest.advanceTimersToNextTimerAsync();
			simulateResponse(200, JSON.stringify({ ok: true }), "application/json");
			await expect(promise).resolves.toEqual({ ok: true });
			expect(https.request).toHaveBeenCalledTimes(2);
			jest.useRealTimers();
		});
	});

	describe("retryCount 0", () => {
		beforeEach(() => {
			(https.request as jest.Mock<(...args: any[]) => any>).mockClear();
		});

		it("should send the request once", async () => {
			const promise = client.get(URLString.of("https://example.com/api"), {
				retryCount: 0,
				timeoutMs: 100 as DurationMs,
			});
			errorHandler!(new Error("read ECONNRESET"));
			await expect(promise).rejects.toThrow("ECONNRESET");
			expect(https.request).toHaveBeenCalledTimes(1);
		});
	});

	describe("gzip and deflate content encoding", () => {
		it("should handle gzip-encoded response", async () => {
			const gzipData = "gzip-compressed-data";
			const mockGunzip = { on: jest.fn<(...args: any[]) => any>() };

			(
				mockGunzip.on as unknown as jest.Mock<(...args: any[]) => any>
			).mockImplementation((e: unknown, cb2: unknown) => {
				if (e === "data") {
					(cb2 as (d: string) => void)(gzipData);
				}
				if (e === "end") {
					(cb2 as () => void)();
				}
			});

			const mockRes = {
				pipe: jest.fn((..._args: any[]) => mockGunzip),
				statusCode: 200,
				headers: { "content-type": "text/plain", "content-encoding": "gzip" },
			};

			(https.request as jest.Mock<(...args: any[]) => any>).mockImplementation(
				(_opts: any, cb: any) => {
					cb(mockRes);
					return {
						write: jest.fn<(...args: any[]) => any>(),
						end: jest.fn<(...args: any[]) => any>(),
						on: jest.fn<(...args: any[]) => any>(),
						setTimeout: jest.fn<(...args: any[]) => any>(),
						destroy: jest.fn<(...args: any[]) => any>(),
					};
				}
			);

			const result = await client.get(URLString.of("https://example.com/data"));
			expect(result).toBe("gzip-compressed-data");
		});

		it("should handle deflate-encoded response", async () => {
			const deflateData = "deflate-compressed-data";
			const mockInflate = { on: jest.fn<(...args: any[]) => any>() };

			(
				mockInflate.on as unknown as jest.Mock<(...args: any[]) => any>
			).mockImplementation((e: unknown, cb2: unknown) => {
				if (e === "data") {
					(cb2 as (d: string) => void)(deflateData);
				}
				if (e === "end") {
					(cb2 as () => void)();
				}
			});

			const mockRes = {
				pipe: jest.fn((..._args: any[]) => mockInflate),
				statusCode: 200,
				headers: {
					"content-type": "text/plain",
					"content-encoding": "deflate",
				},
			};

			(https.request as jest.Mock<(...args: any[]) => any>).mockImplementation(
				(_opts: any, cb: any) => {
					cb(mockRes);
					return {
						write: jest.fn<(...args: any[]) => any>(),
						end: jest.fn<(...args: any[]) => any>(),
						on: jest.fn<(...args: any[]) => any>(),
						setTimeout: jest.fn<(...args: any[]) => any>(),
						destroy: jest.fn<(...args: any[]) => any>(),
					};
				}
			);

			const result = await client.get(URLString.of("https://example.com/data"));
			expect(result).toBe("deflate-compressed-data");
		});
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
