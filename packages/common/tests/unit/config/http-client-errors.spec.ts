import { describe, expect, it } from "@jest/globals";
import {
	HttpClientError,
	HttpClientTimeoutError,
} from "../../../src/config/http-client-errors";

describe("HttpClientError", () => {
	it("should create error with message", () => {
		const err = new HttpClientError("test error");
		expect(err.message).toBe("test error");
		expect(err.code).toBe("HttpClientError");
		expect(err.name).toBe("HttpClientError");
		expect(err.statusCode).toBeUndefined();
	});

	it("should create error with status code", () => {
		const err = new HttpClientError("not found", 404 as never);
		expect(err.message).toBe("not found");
		expect(err.statusCode).toBe(404);
	});

	it("should convert to error response", () => {
		const err = new HttpClientError("bad request", 400 as never);
		const resp = err.toErrorResponse();
		expect(resp).toEqual({
			code: "HttpClientError",
			message: "bad request",
			statusCode: 400,
		});
	});

	it("should convert to error response without status code", () => {
		const err = new HttpClientError("generic error");
		const resp = err.toErrorResponse();
		expect(resp).toEqual({
			code: "HttpClientError",
			message: "generic error",
			statusCode: undefined,
		});
	});
});

describe("HttpClientTimeoutError", () => {
	it("should create timeout error with message and timeoutMs", () => {
		const err = new HttpClientTimeoutError("timed out", 5000);
		expect(err.message).toBe("timed out");
		expect(err.timeoutMs).toBe(5000);
		expect(err.code).toBe("HttpClientTimeoutError");
		expect(err.name).toBe("HttpClientTimeoutError");
	});
});
