import { describe, expect, it } from "@jest/globals";
import {
	addressManagerError,
	agentError,
	authenticationError,
	createAppError,
	deadLetterError,
	ErrorCode,
	isAppError,
	isAuthenticationError,
	isServiceUnreachableError,
	messageManagerError,
	normalizeError,
	serviceNotFoundError,
	serviceUnreachableError,
	timeoutError,
} from "../../src/utils/errors";

describe("AppError", () => {
	it("should be constructable with message", () => {
		const error = serviceNotFoundError("test");
		expect(error).toBeInstanceOf(Error);
		expect(isAppError(error)).toBe(true);
		expect(error.message).toBe("test");
	});

	it("should store cause", () => {
		const cause = new Error("root");
		const error = createAppError("test", { cause });
		expect(error.cause).toBe(cause);
	});

	it("should have cause undefined when not provided", () => {
		const error = serviceNotFoundError("test");
		expect(error.cause).toBeUndefined();
	});

	it("should set error code for correct identification", () => {
		const error = serviceNotFoundError("Service X not found");
		expect(error.code).toBe("ServiceNotFoundError");
	});

	it("should tag each factory with its error code", () => {
		expect(addressManagerError("x").code).toBe(ErrorCode.AddressManager);
		expect(messageManagerError("x").code).toBe(ErrorCode.MessageManager);
		expect(timeoutError("x").code).toBe(ErrorCode.Timeout);
		expect(agentError("x").code).toBe(ErrorCode.Agent);
	});

	it("should be identified by type guard for ServiceUnreachableError", () => {
		const error = serviceUnreachableError("Cannot reach");
		expect(isServiceUnreachableError(error)).toBe(true);
	});

	it("should be identified by type guard for AuthenticationError", () => {
		const error = authenticationError("Invalid token");
		expect(isAuthenticationError(error)).toBe(true);
	});

	it("should support DeadLetterError with reason", () => {
		const error = deadLetterError("custom reason", {
			reason: "custom reason",
		});
		expect(error.reason).toBe("custom reason");
		expect(error.message).toBe("custom reason");
	});

	it("should support DeadLetterError without reason", () => {
		const error = deadLetterError("Message sent to dead letter queue");
		expect(error.reason).toBeUndefined();
		expect(error.message).toBe("Message sent to dead letter queue");
	});

	it("should store cause with DeadLetterError", () => {
		const cause = new Error("root");
		const error = deadLetterError("reason", {
			reason: "reason",
			cause,
		});
		expect(error.cause).toBe(cause);
		expect(error.reason).toBe("reason");
	});

	it("should store cause with AgentError", () => {
		const cause = new Error("root");
		const error = agentError("msg", { cause });
		expect(error.cause).toBe(cause);
	});

	it("should have correct message for AgentError", () => {
		const error = agentError("ML failure");
		expect(error.message).toBe("ML failure");
	});

	describe("normalizeError", () => {
		it("should return Error instance unchanged", () => {
			const err = new Error("test");
			expect(normalizeError(err)).toBe(err);
		});

		it("should wrap string in Error", () => {
			const result = normalizeError("something broke");
			expect(result).toBeInstanceOf(Error);
			expect(result.message).toBe("something broke");
		});

		it("should wrap object with message property", () => {
			const result = normalizeError({ message: "object error" });
			expect(result).toBeInstanceOf(Error);
			expect(result.message).toBe("object error");
		});

		it("should wrap unknown type with default message", () => {
			const result = normalizeError(42);
			expect(result).toBeInstanceOf(Error);
			expect(result.message).toBe("Unknown error: 42");
		});
	});
});
