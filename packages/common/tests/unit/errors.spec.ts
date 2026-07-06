import { describe, expect, it } from "@jest/globals";
import {
	addressManagerError,
	agentError,
	AppError,
	authenticationError,
	deadLetterError,
	messageManagerError,
	metadataBuilderError,
	nackError,
	normalizeError,
	serviceNotFoundError,
	serviceUnreachableError,
	timeoutError,
	isServiceNotFoundError,
	isServiceUnreachableError,
	isAuthenticationError,
	isAddressManagerError,
	isMessageManagerError,
	isMetadataBuilderError,
	isTimeoutError,
	isNackError,
	isDeadLetterError,
	isAgentError,
} from "../../src/utils/errors";

describe("AppError", () => {
	it("should be constructable with message", () => {
		const error = serviceNotFoundError("test");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(AppError);
		expect(error.message).toBe("test");
	});

	it("should store cause", () => {
		const cause = new Error("root");
		const error = new AppError("test", { cause });
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

	it("should be identified by type guard", () => {
		const error = serviceNotFoundError("Service X not found");
		expect(isServiceNotFoundError(error)).toBe(true);
	});

	it("should be identified by type guard for ServiceUnreachableError", () => {
		const error = serviceUnreachableError("Cannot reach");
		expect(isServiceUnreachableError(error)).toBe(true);
	});

	it("should be identified by type guard for AuthenticationError", () => {
		const error = authenticationError("Invalid token");
		expect(isAuthenticationError(error)).toBe(true);
	});

	it("should be identified by type guard for AddressManagerError", () => {
		const error = addressManagerError("Generic error");
		expect(isAddressManagerError(error)).toBe(true);
	});

	it("should be identified by type guard for MessageManagerError", () => {
		const error = messageManagerError("Failed");
		expect(isMessageManagerError(error)).toBe(true);
	});

	it("should be identified by type guard for MetadataBuilderError", () => {
		const error = metadataBuilderError("Missing field");
		expect(isMetadataBuilderError(error)).toBe(true);
	});

	it("should be identified by type guard for TimeoutError", () => {
		const error = timeoutError("timed out");
		expect(isTimeoutError(error)).toBe(true);
	});

	it("should support reason via options", () => {
		const error = nackError("custom reason", {
			reason: "custom reason",
		});
		expect(error.reason).toBe("custom reason");
		expect(error.message).toBe("custom reason");
	});

	it("should support NACK_ERROR without reason", () => {
		const error = nackError("Message negatively acknowledged");
		expect(error.reason).toBeUndefined();
		expect(error.message).toBe("Message negatively acknowledged");
	});

	it("should store cause with NackError", () => {
		const cause = new Error("root");
		const error = nackError("reason", {
			reason: "reason",
			cause,
		});
		expect(error.cause).toBe(cause);
		expect(error.reason).toBe("reason");
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

	it("should be identified by type guard for AgentError", () => {
		const error = agentError("agent error");
		expect(isAgentError(error)).toBe(true);
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
