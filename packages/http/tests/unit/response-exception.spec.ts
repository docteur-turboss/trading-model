import { describe, expect, it } from "@jest/globals";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	ResponseException,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";

describe("ResponseException", () => {
	describe("response methods", () => {
		it("Unauthorized() should return 401", () => {
			const result = ResponseException("no auth").unauthorized();
			expect(result).toEqual({ status: 401, data: "no auth" });
		});

		it("Forbidden() should return 403", () => {
			const result = ResponseException("forbidden").forbidden();
			expect(result).toEqual({ status: 403, data: "forbidden" });
		});

		it("should keep an object reason as the JSON body", () => {
			const result = ResponseException({ code: "ERR" }).forbidden();
			expect(result.data).toEqual({ code: "ERR" });
		});

		it("should keep a null reason", () => {
			const result = ResponseException(null).forbidden();
			expect(result.data).toBeNull();
		});
	});

	describe("default empty reason", () => {
		it("should default to empty string", () => {
			const result = ResponseException().unauthorized();
			expect(result.data).toBe("");
		});
	});

	describe("sendResponse", () => {
		it("should return ResponseObject with given data and status", () => {
			const result = sendResponse({ id: 1 }, HTTP_STATUS.CREATED);
			expect(result).toEqual({ status: 201, data: { id: 1 } });
		});

		it("should return ResponseObject with null data", () => {
			const result = sendResponse(null, HTTP_STATUS.NO_CONTENT);
			expect(result).toEqual({ status: 204, data: null });
		});
	});
});
