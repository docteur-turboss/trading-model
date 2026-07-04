import { describe, expect, it } from "@jest/globals";
import {
	ClassResponseExceptions,
	HTTP_CODE,
	ResponseCodes,
	ResponseException,
	sendResponse,
} from "../../src/middleware/response-exception";

describe("ClassResponseExceptions", () => {
	describe("ResponseCodes", () => {
		it("should have correct HTTP codes for all methods", () => {
			expect(ResponseCodes.success).toBe(200);
			expect(ResponseCodes.ok).toBe(201);
			expect(ResponseCodes.noContent).toBe(204);
			expect(ResponseCodes.badRequest).toBe(400);
			expect(ResponseCodes.unauthorized).toBe(401);
			expect(ResponseCodes.paymentRequired).toBe(402);
			expect(ResponseCodes.forbidden).toBe(403);
			expect(ResponseCodes.notFound).toBe(404);
			expect(ResponseCodes.methodNotAllowed).toBe(405);
			expect(ResponseCodes.conflict).toBe(409);
			expect(ResponseCodes.gone).toBe(410);
			expect(ResponseCodes.payloadTooLarge).toBe(413);
			expect(ResponseCodes.imaTeapot).toBe(418);
			expect(ResponseCodes.tooManyRequests).toBe(429);
			expect(ResponseCodes.invalidToken).toBe(498);
			expect(ResponseCodes.unknownError).toBe(500);
			expect(ResponseCodes.serviceUnavailable).toBe(503);
		});
	});

	describe("HTTP_CODE", () => {
		it("should map keys to themselves", () => {
			expect(HTTP_CODE.success).toBe("success");
			expect(HTTP_CODE.badRequest).toBe("badRequest");
			expect(HTTP_CODE.notFound).toBe("notFound");
			expect(HTTP_CODE.unknownError).toBe("unknownError");
		});
	});

	describe("response methods", () => {
		it("Success() should return 200", () => {
			const result = new ClassResponseExceptions("ok").success();
			expect(result.status).toBe(200);
			expect(result.data).toBe("ok");
		});

		it("OK() should return 201", () => {
			const result = ResponseException("created").ok();
			expect(result.status).toBe(201);
			expect(result.data).toBe("created");
		});

		it("NoContent() should return 204 with undefined data", () => {
			const result = new ClassResponseExceptions("").noContent();
			expect(result.status).toBe(204);
			expect(result.data).toBeUndefined();
		});

		it("BadRequest() should return 400", () => {
			const result = ResponseException("invalid").badRequest();
			expect(result.status).toBe(400);
			expect(result.data).toBe("invalid");
		});

		it("Unauthorized() should return 401", () => {
			const result = ResponseException("no auth").unauthorized();
			expect(result.status).toBe(401);
		});

		it("PaymentRequired() should return 402", () => {
			const result = ResponseException("payment").paymentRequired();
			expect(result.status).toBe(402);
		});

		it("Forbidden() should return 403", () => {
			const result = ResponseException("forbidden").forbidden();
			expect(result.status).toBe(403);
		});

		it("NotFound() should return 404", () => {
			const result = ResponseException("not found").notFound();
			expect(result.status).toBe(404);
			expect(result.data).toBe("not found");
		});

		it("MethodNotAllowed() should return 405", () => {
			const result = ResponseException("bad method").methodNotAllowed();
			expect(result.status).toBe(405);
		});

		it("Conflict() should return 409", () => {
			const result = ResponseException("conflict").conflict();
			expect(result.status).toBe(409);
		});

		it("Gone() should return 410", () => {
			const result = ResponseException("gone").gone();
			expect(result.status).toBe(410);
		});

		it("PayloadTooLarge() should return 413", () => {
			const result = ResponseException("too big").payloadTooLarge();
			expect(result.status).toBe(413);
		});

		it("IMATeapot() should return 418", () => {
			const result = ResponseException("teapot").imaTeapot();
			expect(result.status).toBe(418);
		});

		it("TooManyRequests() should return 429", () => {
			const result = ResponseException("rate limit").tooManyRequests();
			expect(result.status).toBe(429);
		});

		it("InvalidToken() should return 498", () => {
			const result = ResponseException("bad token").invalidToken();
			expect(result.status).toBe(498);
		});

		it("UnknownError() should return 500", () => {
			const result = ResponseException("error").unknownError();
			expect(result.status).toBe(500);
		});

		it("ServiceUnavailable() should return 503", () => {
			const result = ResponseException("down").serviceUnavailable();
			expect(result.status).toBe(503);
		});

		it("should serialize non-string reasons to JSON", () => {
			const result = ResponseException({ code: "ERR" }).badRequest();
			expect(result.data).toBe('{"code":"ERR"}');
		});

		it("should handle null reason", () => {
			const result = ResponseException(null).badRequest();
			expect(result.data).toBe("null");
		});

		it("should handle numeric reason", () => {
			const result = ResponseException(42).success();
			expect(result.data).toBe("42");
		});
	});

	describe("default empty reason", () => {
		it("should default to empty string", () => {
			const result = ResponseException().success();
			expect(result.data).toBe("");
		});
	});

	describe("sendResponse", () => {
		it("should return ResponseObject with given data and status", () => {
			const result = sendResponse({ id: 1 }, 201);
			expect(result).toEqual({ status: 201, data: { id: 1 } });
		});

		it("should return ResponseObject with null data", () => {
			const result = sendResponse(null, 204);
			expect(result).toEqual({ status: 204, data: null });
		});
	});
});
