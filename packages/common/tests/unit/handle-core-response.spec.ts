import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import ChainedError from "chained-error";
import {
	ensureAtLeastOneField,
	handleCoreError,
	handleDBError,
	handleOnlyDataCore,
} from "../../src/middleware/handle-core-error";
import {
	handleCoreAuthResponse,
	handleCoreResponse,
} from "../../src/middleware/handle-core-response";

describe("handleCoreResponse", () => {
	let res: any;

	beforeEach(() => {
		res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			cookie: jest.fn().mockReturnThis(),
		};
	});

	describe("handleCoreResponse", () => {
		it("should format and send a success response", async () => {
			const coreFn = jest.fn<any>().mockResolvedValue(["data", "success"]);

			await handleCoreResponse(coreFn, res);

			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({ status: 200, data: "data" })
			);
		});

		it("should handle non-success response codes", async () => {
			const coreFn = jest
				.fn<any>()
				.mockResolvedValue(["not found", "notFound"]);

			await handleCoreResponse(coreFn, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({ status: 404, data: "not found" })
			);
		});
	});

	describe("handleCoreAuthResponse", () => {
		it("should set auth cookie and send response", async () => {
			const coreFn = jest
				.fn<any>()
				.mockResolvedValue(["token-value", "success"]);

			await handleCoreAuthResponse(coreFn, res);

			expect(res.cookie).toHaveBeenCalledWith(
				"token",
				"token-value",
				expect.objectContaining({
					httpOnly: true,
					sameSite: "strict",
				})
			);
			expect(res.status).toHaveBeenCalledWith(200);
		});

		it("should send JSON with correct structure", async () => {
			const coreFn = jest
				.fn<any>()
				.mockResolvedValue(["token-value", "success"]);

			await handleCoreAuthResponse(coreFn, res);

			expect(res.cookie).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({ status: 200, data: "token-value" })
			);
		});

		it("should handle auth errors", async () => {
			const coreFn = jest
				.fn<any>()
				.mockResolvedValue(["invalid token", "unauthorized"]);

			await handleCoreAuthResponse(coreFn, res);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({ status: 401, data: "invalid token" })
			);
		});
	});

	describe("ensureAtLeastOneField", () => {
		it("should throw if all fields are falsy", () => {
			expect(() => ensureAtLeastOneField({ name: "", age: null })).toThrow();
		});

		it("should not throw if at least one field is truthy", () => {
			expect(() =>
				ensureAtLeastOneField({ name: "John", age: null })
			).not.toThrow();
		});
	});

	describe("handleDBError", () => {
		it('should throw "404" for "No result returned" error', () => {
			const chainedError = new ChainedError("No result returned");
			expect(() => handleDBError("user")(chainedError)).toThrow("404");
		});

		it('should throw "Nom exist" for duplicate name entry', () => {
			const chainedError = new ChainedError(
				"Duplicate entry abc for key name_UNIQUE"
			);
			expect(() => handleDBError("user")(chainedError)).toThrow("Nom exist");
		});

		it('should throw "Email exist" for duplicate email entry', () => {
			const chainedError = new ChainedError(
				"Duplicate entry abc for key email_UNIQUE"
			);
			expect(() => handleDBError("user")(chainedError)).toThrow("Email exist");
		});

		it("should re-throw non-ChainedError (plain Error)", () => {
			const plainError = new Error("random error");
			expect(() => handleDBError("user")(plainError)).toThrow("random error");
		});

		it("should handle ChainedError with unmatched message", () => {
			const chainedError = new ChainedError("Some unrelated error");
			expect(() => handleDBError("user")(chainedError)).toThrow(
				"Some unrelated error"
			);
		});

		it("should handle ChainedError with duplicate entry for unknown key", () => {
			const chainedError = new ChainedError(
				"Duplicate entry abc for key other_UNIQUE"
			);
			expect(() => handleDBError("user")(chainedError)).toThrow(
				"Duplicate entry abc for key other_UNIQUE"
			);
		});

		it("should handle ChainedError with undefined message", () => {
			const err = Object.assign(Object.create(ChainedError.prototype), {
				message: undefined,
			});
			expect(() => handleDBError("user")(err)).toThrow("");
		});
	});

	describe("handleCoreError", () => {
		it("should return mapped error tuple for known error message", () => {
			const mapping = {
				USER_NOT_FOUND: ["404", "User not found"] as [string, string],
			};
			const result = handleCoreError(
				"user" as any,
				"getUser",
				new Error("USER_NOT_FOUND"),
				mapping
			);
			expect(result).toEqual(["404", "User not found"]);
		});

		it("should re-throw unmapped error", () => {
			const mapping = {
				USER_NOT_FOUND: ["404", "User not found"] as [string, string],
			};
			expect(() =>
				handleCoreError("user" as any, "getUser", new Error("UNKNOWN"), mapping)
			).toThrow("UNKNOWN");
		});

		it("should handle non-Error thrown values by re-throwing", () => {
			const mapping = {};
			expect(() =>
				handleCoreError("user" as any, "test", "string error", mapping)
			).toThrow("string error");
		});
	});

	describe("handleOnlyDataCore", () => {
		it("should return tuple with data and Success code", async () => {
			const fn = jest.fn<any>().mockResolvedValue({ id: 1 });
			const result = await handleOnlyDataCore(
				fn,
				{} as any,
				"user" as any,
				"test"
			);
			expect(result).toEqual([{ id: 1 }, "success"]);
		});

		it("should map errors using provided mapping", async () => {
			const fn = jest.fn<any>().mockRejectedValue(new Error("NOT_FOUND"));
			const result = await handleOnlyDataCore(
				fn,
				{ NOT_FOUND: ["404", "Not found"] } as any,
				"user" as any,
				"test"
			);
			expect(result).toEqual(["404", "Not found"]);
		});

		it("should use default empty errorMap", async () => {
			const fn = jest.fn<any>().mockResolvedValue("data");
			const result = await (handleOnlyDataCore as any)(
				fn,
				undefined,
				"user" as any,
				"test"
			);
			expect(result).toEqual(["data", "success"]);
		});
	});
});
