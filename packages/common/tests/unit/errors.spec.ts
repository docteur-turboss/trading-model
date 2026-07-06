import { describe, expect, it } from "@jest/globals";
import {
	AddressManagerError,
	AgentError,
	AppError,
	AuthenticationError,
	DeadLetterError,
	MessageManagerError,
	MetadataBuilderError,
	NackError,
	normalizeError,
	ServiceNotFoundError,
	ServiceUnreachableError,
	TimeoutError,
} from "../../src/utils/errors";

describe("AppError", () => {
	it("should be constructable with message", () => {
		const error = new ServiceNotFoundError("test");
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
		const error = new ServiceNotFoundError("test");
		expect(error.cause).toBeUndefined();
	});

	it("should set constructor name for correct error chain", () => {
		const error = new ServiceNotFoundError("Service X not found");
		expect(error.name).toBe("ServiceNotFoundError");
	});

	it("should be instanceof ServiceNotFoundError", () => {
		const error = new ServiceNotFoundError("Service X not found");
		expect(error).toBeInstanceOf(ServiceNotFoundError);
	});

	it("should be instanceof ServiceUnreachableError", () => {
		const error = new ServiceUnreachableError("Cannot reach");
		expect(error).toBeInstanceOf(ServiceUnreachableError);
	});

	it("should be instanceof AuthenticationError", () => {
		const error = new AuthenticationError("Invalid token");
		expect(error).toBeInstanceOf(AuthenticationError);
	});

	it("should be instanceof AddressManagerError", () => {
		const error = new AddressManagerError("Generic error");
		expect(error).toBeInstanceOf(AddressManagerError);
	});

	it("should be instanceof MessageManagerError", () => {
		const error = new MessageManagerError("Failed");
		expect(error).toBeInstanceOf(MessageManagerError);
	});

	it("should be instanceof MetadataBuilderError", () => {
		const error = new MetadataBuilderError("Missing field");
		expect(error).toBeInstanceOf(MetadataBuilderError);
	});

	it("should be instanceof TimeoutError", () => {
		const error = new TimeoutError("timed out");
		expect(error).toBeInstanceOf(TimeoutError);
	});

	it("should support reason via options", () => {
		const error = new NackError("custom reason", {
			reason: "custom reason",
		});
		expect(error.reason).toBe("custom reason");
		expect(error.message).toBe("custom reason");
	});

	it("should support NACK_ERROR without reason", () => {
		const error = new NackError("Message negatively acknowledged");
		expect(error.reason).toBeUndefined();
		expect(error.message).toBe("Message negatively acknowledged");
	});

	it("should store cause with NackError", () => {
		const cause = new Error("root");
		const error = new NackError("reason", {
			reason: "reason",
			cause,
		});
		expect(error.cause).toBe(cause);
		expect(error.reason).toBe("reason");
	});

	it("should support DeadLetterError with reason", () => {
		const error = new DeadLetterError("custom reason", {
			reason: "custom reason",
		});
		expect(error.reason).toBe("custom reason");
		expect(error.message).toBe("custom reason");
	});

	it("should support DeadLetterError without reason", () => {
		const error = new DeadLetterError("Message sent to dead letter queue");
		expect(error.reason).toBeUndefined();
		expect(error.message).toBe("Message sent to dead letter queue");
	});

	it("should store cause with DeadLetterError", () => {
		const cause = new Error("root");
		const error = new DeadLetterError("reason", {
			reason: "reason",
			cause,
		});
		expect(error.cause).toBe(cause);
		expect(error.reason).toBe("reason");
	});

	it("should be instanceof AgentError", () => {
		const error = new AgentError("agent error");
		expect(error).toBeInstanceOf(AgentError);
	});

	it("should store cause with AgentError", () => {
		const cause = new Error("root");
		const error = new AgentError("msg", { cause });
		expect(error.cause).toBe(cause);
	});

	it("should have correct message for AgentError", () => {
		const error = new AgentError("ML failure");
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
