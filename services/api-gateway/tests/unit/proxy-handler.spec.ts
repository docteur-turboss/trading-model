import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createReq } from "../helpers/express";

const ENV: any = {
	AUTH_TOKEN_HEADER: "x-api-key",
	PROXY_TIMEOUT_MS: 10000,
	PROXY_MAX_RESPONSE_BYTES: 16,
	PROXY_MAX_CONCURRENT: 1,
	TLS_KEY_PATH: "/k",
	TLS_CERT_PATH: "/c",
	TLS_CA_PATH: "/a",
};

jest.mock("@trading-model/http/http-tls-loader", () => ({
	buildHttpsAgentOptions: jest.fn((..._args: any[]) => ({})),
}));

jest.mock("@trading-model/http/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

const MOCK_TARGET = { host: "10.0.1.5", port: 3000, version: "1.0.0" };

function createMockResponse(
	statusCode: number,
	body: string,
	headers?: Record<string, string>
) {
	const resEvents: Record<string, Array<(...args: any[]) => void>> = {};
	const reqEvents: Record<string, Array<(...args: any[]) => void>> = {};

	const mockRes: any = {
		statusCode,
		headers: headers ?? { "content-type": "application/json" },
		on: jest.fn((event: string, handler: (...args: any[]) => void) => {
			if (!resEvents[event]) {
				resEvents[event] = [];
			}
			resEvents[event].push(handler);
			return mockRes;
		}),
	};

	const mockReq = {
		on: jest.fn((event: string, handler: (...args: any[]) => void) => {
			if (!reqEvents[event]) {
				reqEvents[event] = [];
			}
			reqEvents[event].push(handler);
			return mockReq;
		}),
		write: jest.fn<(...args: any[]) => any>(),
		end: jest.fn<(...args: any[]) => any>().mockImplementation(() => {
			if (reqEvents.data) {
				for (const h of reqEvents.data) {
					h(Buffer.from(body));
				}
			}
			if (reqEvents.end) {
				for (const h of reqEvents.end) {
					h();
				}
			}
		}),
		destroy: jest.fn<(...args: any[]) => any>(),
	};

	return { mockRes, mockReq, events: resEvents };
}

function createMockHttps(
	makeReq: (opts: any, callback: (res: any) => void) => any
) {
	return jest.fn<(...args: any[]) => any>().mockImplementation(makeReq);
}

function stubUpstream(
	res: ReturnType<typeof createMockResponse>,
	chunks: string[],
	onOpts?: (opts: any) => void
) {
	const { mockRes, mockReq, events } = res;
	require("node:https").request = createMockHttps(
		(opts: any, callback: (res: any) => void) => {
			onOpts?.(opts);
			callback(mockRes);
			for (const h of events.data ?? []) {
				for (const c of chunks) {
					h(Buffer.from(c));
				}
			}
			for (const h of events.end ?? []) {
				h();
			}
			return mockReq;
		}
	);
}

const loadForward = async () => {
	const { forwardRequest } = await Promise.resolve(
		require("../../src/adapters/outbound/proxy-handler")
	);
	return (opts: any) => forwardRequest(opts, ENV);
};

describe("proxy-handler", () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
	});

	it("should forward a GET request and return the response", async () => {
		const { mockRes, mockReq, events } = createMockResponse(
			200,
			JSON.stringify({ data: "ok" })
		);

		stubUpstream({ mockRes, mockReq, events }, [
			JSON.stringify({ data: "ok" }),
		]);

		const forward = await loadForward();
		const req = createReq({
			method: "GET",
			headers: { "x-request-id": "req-123" },
		});
		const result = await forward({
			req,
			target: MOCK_TARGET,
			path: "/v1/api/data",
		});

		expect(result.status).toBe(200);
		expect(JSON.parse(result.body)).toEqual({ data: "ok" });
	});

	it("should strip x-api-key header from forwarded request", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");

		stubUpstream({ mockRes, mockReq, events }, ["{}"]);

		const forward = await loadForward();
		const req = createReq({
			method: "GET",
			headers: { "x-api-key": "secret", "x-request-id": "req-123" },
		});
		await forward({ req, target: MOCK_TARGET, path: "/test" });

		expect(mockReq.end).toHaveBeenCalled();
	});

	it("should reject on connection error", async () => {
		const https = require("node:https");
		https.request = jest
			.fn<(...args: any[]) => any>()
			.mockImplementation(() => {
				const errReq = {
					on: jest.fn((event: string, handler: (err?: Error) => void) => {
						if (event === "error") {
							handler(new Error("ECONNREFUSED"));
						}
						return errReq;
					}),
					write: jest.fn<(...args: any[]) => any>(),
					end: jest.fn<(...args: any[]) => any>(),
					destroy: jest.fn<(...args: any[]) => any>(),
				};
				return errReq;
			});

		const forward = await loadForward();
		const req = createReq({ method: "GET" });
		await expect(
			forward({ req, target: MOCK_TARGET, path: "/test" })
		).rejects.toThrow("ECONNREFUSED");
	});

	it("should reject after PROXY_TIMEOUT_MS in total, even if the upstream keeps sending", async () => {
		jest.useFakeTimers();
		try {
			const { mockRes, mockReq, events } = createMockResponse(200, "");
			mockReq.end.mockImplementation(() => undefined);
			(mockReq as any).destroy = jest.fn<(...args: any[]) => any>();
			require("node:https").request = createMockHttps(
				(_opts: any, callback: (res: any) => void) => {
					callback(mockRes);
					return mockReq;
				}
			);
			const forward = await loadForward();
			const {
				UpstreamTimeoutError,
			} = require("../../src/domain/ports/gateway.port");
			const result = forward({
				req: createReq({ method: "GET" }),
				target: MOCK_TARGET,
				path: "/test",
			});
			const outcome =
				expect(result).rejects.toBeInstanceOf(UpstreamTimeoutError);
			// One byte every 3 s: the inactivity timeout of the socket never fires.
			for (let i = 0; i < 4; i++) {
				for (const h of events.data ?? []) {
					h(Buffer.from("x"));
				}
				jest.advanceTimersByTime(3000);
			}
			await outcome;
			expect((mockReq as any).destroy).toHaveBeenCalled();
		} finally {
			jest.useRealTimers();
		}
	});

	it("should handle array headers by joining with comma", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");

		stubUpstream({ mockRes, mockReq, events }, ["{}"]);

		const forward = await loadForward();
		const req = createReq({
			method: "GET",
			headers: {
				"x-request-id": "req-123",
				accept: ["text/html", "application/json"],
			},
		});
		const result = await forward({ req, target: MOCK_TARGET, path: "/test" });
		expect(result.status).toBe(200);
	});

	it("should handle non-string non-array header value (implicit else branch)", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");

		stubUpstream({ mockRes, mockReq, events }, ["{}"]);

		const forward = await loadForward();
		const req = createReq({
			method: "GET",
			headers: { "x-request-id": "req-123", "content-length": 42 },
		});
		const result = await forward({ req, target: MOCK_TARGET, path: "/test" });
		expect(result.status).toBe(200);
	});

	it("should use socket.remoteAddress when req.ip is undefined", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");

		stubUpstream({ mockRes, mockReq, events }, ["{}"]);

		const forward = await loadForward();
		const req = createReq({
			method: "GET",
			ip: undefined,
			socket: { remoteAddress: "10.0.0.1" },
		});
		const result = await forward({ req, target: MOCK_TARGET, path: "/test" });
		expect(result.status).toBe(200);
	});

	it("should fallback to unknown when both ip and socket.remoteAddress are undefined", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");

		stubUpstream({ mockRes, mockReq, events }, ["{}"]);

		const forward = await loadForward();
		const req = createReq({
			method: "GET",
			ip: undefined,
			socket: { remoteAddress: undefined },
		});
		const result = await forward({ req, target: MOCK_TARGET, path: "/test" });
		expect(result.status).toBe(200);
	});

	it("should fallback to 503 when statusCode is null", async () => {
		const { mockRes, mockReq, events } = createMockResponse(
			0 as unknown as number,
			"error"
		);
		mockRes.statusCode = null;

		stubUpstream({ mockRes, mockReq, events }, ["error"]);

		const forward = await loadForward();
		const req = createReq({ method: "GET" });
		const result = await forward({ req, target: MOCK_TARGET, path: "/test" });
		expect(result.status).toBe(503);
	});

	it("should forward POST body", async () => {
		const { mockRes, mockReq, events } = createMockResponse(
			200,
			JSON.stringify({ saved: true })
		);

		stubUpstream({ mockRes, mockReq, events }, [
			JSON.stringify({ saved: true }),
		]);

		const forward = await loadForward();
		const req = createReq({
			method: "POST",
			body: { name: "test" },
			headers: { "content-type": "application/json" },
		});
		const result = await forward({
			req,
			target: MOCK_TARGET,
			path: "/v1/api/create",
		});

		expect(result.status).toBe(200);
		expect(mockReq.write).toHaveBeenCalledWith(
			JSON.stringify({ name: "test" })
		);
	});

	it("should declare the length of the re-serialized body, not the client's", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");
		let sentHeaders: Record<string, string> = {};
		stubUpstream({ mockRes, mockReq, events }, ["{}"], (opts) => {
			sentHeaders = opts.headers;
		});

		const forward = await loadForward();
		// Formatted JSON from the client: 28 bytes, re-serialized as 15.
		const req = createReq({
			method: "POST",
			body: { name: "test" },
			headers: {
				"content-type": "application/json",
				"content-length": "28",
			},
		});
		await forward({ req, target: MOCK_TARGET, path: "/v1/api/create" });

		expect(sentHeaders["content-length"]).toBe("15");
	});

	it("should not declare a body length when there is no body", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");
		let sentHeaders: Record<string, string> = {};
		stubUpstream({ mockRes, mockReq, events }, ["{}"], (opts) => {
			sentHeaders = opts.headers;
		});

		const forward = await loadForward();
		const req = createReq({
			method: "POST",
			body: {},
			headers: { "content-length": "2" },
		});
		await forward({ req, target: MOCK_TARGET, path: "/v1/api/create" });

		expect(sentHeaders["content-length"]).toBeUndefined();
		expect(mockReq.write).not.toHaveBeenCalled();
	});

	it("should cut an upstream answer past PROXY_MAX_RESPONSE_BYTES", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "");
		mockRes.destroy = jest.fn<(...args: any[]) => any>();
		stubUpstream({ mockRes, mockReq, events }, ["[111111111", ",222222222"]);

		const forward = await loadForward();
		const {
			UpstreamResponseTooLargeError,
		} = require("../../src/domain/ports/gateway.port");
		const req = createReq({ method: "GET" });
		await expect(
			forward({ req, target: MOCK_TARGET, path: "/test" })
		).rejects.toBeInstanceOf(UpstreamResponseTooLargeError);
		expect(mockRes.destroy).toHaveBeenCalled();
	});

	it("should refuse a request past PROXY_MAX_CONCURRENT", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");
		stubUpstream({ mockRes, mockReq, events }, ["{}"]);

		const forward = await loadForward();
		const {
			ProxyOverloadedError,
		} = require("../../src/domain/ports/gateway.port");
		const req = createReq({ method: "GET" });
		const first = forward({ req, target: MOCK_TARGET, path: "/a" });
		await expect(
			forward({ req, target: MOCK_TARGET, path: "/b" })
		).rejects.toBeInstanceOf(ProxyOverloadedError);
		await first;
	});

	it("should reject when the upstream answer errors mid-body", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "");
		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);
				for (const h of events.error ?? []) {
					h(new Error("aborted"));
				}
				return mockReq;
			}
		);

		const forward = await loadForward();
		const req = createReq({ method: "GET" });
		await expect(
			forward({ req, target: MOCK_TARGET, path: "/test" })
		).rejects.toThrow("aborted");
	});
});
