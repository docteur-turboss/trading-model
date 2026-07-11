import { describe, expect, it, jest } from "@jest/globals";

import { AuthHandler, CaWssMessageType } from "../../src/auth-handler";

describe("AuthHandler", () => {
	it("should start with isAuthSent as false", () => {
		const handler = new AuthHandler();
		expect(handler.isAuthSent).toBe(false);
	});

	it("should set isAuthSent to true on successful auth response", () => {
		const handler = new AuthHandler();
		handler.handleResponse(
			{ type: CaWssMessageType.AuthResponse, success: true },
			jest.fn()
		);
		expect(handler.isAuthSent).toBe(true);
	});

	it("should call onRejected on failed auth response", () => {
		const handler = new AuthHandler();
		const onRejected = jest.fn();
		handler.handleResponse(
			{
				type: CaWssMessageType.AuthResponse,
				success: false,
				error: { message: "invalid token" },
			},
			onRejected
		);
		expect(handler.isAuthSent).toBe(false);
		expect(onRejected).toHaveBeenCalled();
	});

	it("should reset isAuthSent to false", () => {
		const handler = new AuthHandler();
		handler.handleResponse(
			{ type: CaWssMessageType.AuthResponse, success: true },
			jest.fn()
		);
		expect(handler.isAuthSent).toBe(true);
		handler.reset();
		expect(handler.isAuthSent).toBe(false);
	});
});
