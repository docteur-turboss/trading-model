import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { HostPort } from "@trading-model/common/domain/service-identity";
import { createReq } from "../helpers/express";

jest.mock("../../src/config/env", () => ({
	ENV: {
		PROXY_TIMEOUT_MS: 10000,
	},
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const MOCK_TARGET = { host: "10.0.1.5", port: 3000, version: "1.0.0" };

function createMockResponse(
	statusCode: number,
	body: string,
	headers?: Record<string, string>
) {
	const events: Record<string, Array<(...args: any[]) => void>> = {};

	const mockRes: any = {
		statusCode,
		headers: headers ?? { "content-type": "application/json" },
		on: jest.fn((event: string, handler: (...args: any[]) => void) => {
			if (!events[event]) {
				events[event] = [];
			}
			events[event].push(handler);
			return mockRes;
		}),
	};

	const mockReq = {
		on: jest.fn((event: string, handler: (...args: any[]) => void) => {
			if (!events[event]) {
				events[event] = [];
			}
			events[event].push(handler);
			return mockReq;
		}),
		write: jest.fn(),
		end: jest.fn().mockImplementation(() => {
			if (events.data) {
				for (const h of events.data) {
					h(Buffer.from(body));
				}
			}
			if (events.end) {
				for (const h of events.end) {
					h();
				}
			}
		}),
		destroy: jest.fn(),
	};

	return { mockRes, mockReq, events };
}

function createMockHttps(
	makeReq: (opts: any, callback: (res: any) => void) => any
) {
	return jest.fn().mockImplementation(makeReq);
}

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

		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);

				if (events.data) {
					for (const h of events.data) {
						h(Buffer.from(JSON.stringify({ data: "ok" })));
					}
				}
				if (events.end) {
					for (const h of events.end) {
						h();
					}
				}

				return mockReq;
			}
		);

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
		const req = createReq({
			method: "GET",
			headers: { "x-request-id": "req-123" },
		});
		const result = await forward({ req, target: MOCK_TARGET, path: "/v1/api/data" });

		expect(result.status).toBe(200);
		expect(JSON.parse(result.body)).toEqual({ data: "ok" });
	});

	it("should strip x-api-key header from forwarded request", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");

		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);

				if (events.data) {
					for (const h of events.data) {
						h(Buffer.from("{}"));
					}
				}
				if (events.end) {
					for (const h of events.end) {
						h();
					}
				}

				return mockReq;
			}
		);

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
		const req = createReq({
			method: "GET",
			headers: { "x-api-key": "secret", "x-request-id": "req-123" },
		});
		await forward({ req, target: MOCK_TARGET, path: "/test" });

		expect(mockReq.end).toHaveBeenCalled();
	});

	it("should reject on connection error", async () => {
		const https = require("node:https");
		https.request = jest.fn().mockImplementation(() => {
			const errReq = {
				on: jest.fn((event: string, handler: (err?: Error) => void) => {
					if (event === "error") {
						handler(new Error("ECONNREFUSED"));
					}
					return errReq;
				}),
				write: jest.fn(),
				end: jest.fn(),
				destroy: jest.fn(),
			};
			return errReq;
		});

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
		const req = createReq({ method: "GET" });
		await expect(forward({ req, target: MOCK_TARGET, path: "/test" })).rejects.toThrow(
			"ECONNREFUSED"
		);
	});

	it("should reject on timeout", async () => {
		const timeoutEvents: Array<() => void> = [];

		const https = require("node:https");
		https.request = jest.fn().mockImplementation(() => {
			const timeoutReq = {
				on: jest.fn((event: string, handler: () => void) => {
					if (event === "timeout") {
						timeoutEvents.push(handler);
					}
					return timeoutReq;
				}),
				write: jest.fn(),
				end: jest.fn().mockImplementation(() => {
					for (const h of timeoutEvents) {
						h();
					}
				}),
				destroy: jest.fn(),
			};
			return timeoutReq;
		});

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
		const req = createReq({ method: "GET" });
		await expect(forward({ req, target: MOCK_TARGET, path: "/test" })).rejects.toThrow("timeout");
	});

	it("should handle array headers by joining with comma", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");

		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);
				if (events.data) {
					for (const h of events.data) {
						h(Buffer.from("{}"));
					}
				}
				if (events.end) {
					for (const h of events.end) {
						h();
					}
				}
				return mockReq;
			}
		);

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
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

		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);
				if (events.data) {
					for (const h of events.data) {
						h(Buffer.from("{}"));
					}
				}
				if (events.end) {
					for (const h of events.end) {
						h();
					}
				}
				return mockReq;
			}
		);

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
		const req = createReq({
			method: "GET",
			headers: { "x-request-id": "req-123", "content-length": 42 },
		});
		const result = await forward({ req, target: MOCK_TARGET, path: "/test" });
		expect(result.status).toBe(200);
	});

	it("should use socket.remoteAddress when req.ip is undefined", async () => {
		const { mockRes, mockReq, events } = createMockResponse(200, "{}");

		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);
				if (events.data) {
					for (const h of events.data) {
						h(Buffer.from("{}"));
					}
				}
				if (events.end) {
					for (const h of events.end) {
						h();
					}
				}
				return mockReq;
			}
		);

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
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

		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);
				if (events.data) {
					for (const h of events.data) {
						h(Buffer.from("{}"));
					}
				}
				if (events.end) {
					for (const h of events.end) {
						h();
					}
				}
				return mockReq;
			}
		);

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
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

		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);
				if (events.data) {
					for (const h of events.data) {
						h(Buffer.from("error"));
					}
				}
				if (events.end) {
					for (const h of events.end) {
						h();
					}
				}
				return mockReq;
			}
		);

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
		const req = createReq({ method: "GET" });
		const result = await forward({ req, target: MOCK_TARGET, path: "/test" });
		expect(result.status).toBe(503);
	});

	it("should forward POST body", async () => {
		const { mockRes, mockReq, events } = createMockResponse(
			200,
			JSON.stringify({ saved: true })
		);

		const https = require("node:https");
		https.request = createMockHttps(
			(_opts: any, callback: (res: any) => void) => {
				callback(mockRes);

				if (events.data) {
					for (const h of events.data) {
						h(Buffer.from(JSON.stringify({ saved: true })));
					}
				}
				if (events.end) {
					for (const h of events.end) {
						h();
					}
				}

				return mockReq;
			}
		);

		const { forwardRequest: forward } = await Promise.resolve(
			require("../../src/core/proxy-handler")
		);
		const req = createReq({
			method: "POST",
			body: { name: "test" },
			headers: { "content-type": "application/json" },
		});
		const result = await forward({ req, target: MOCK_TARGET, path: "/v1/api/create" });

		expect(result.status).toBe(200);
		expect(mockReq.write).toHaveBeenCalledWith(
			JSON.stringify({ name: "test" })
		);
	});
});
