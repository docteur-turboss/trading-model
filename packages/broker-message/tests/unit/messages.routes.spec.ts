import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/http/messages.controller", () => ({
	MESSAGE_CONTROLLER: jest.fn(),
}));

import { CREATE_CALLBACK_ROUTE } from "../../src/http/messages.routes";

describe("CREATE_CALLBACK_ROUTE", () => {
	it("should return a router", () => {
		const router = CREATE_CALLBACK_ROUTE("/message");
		expect(router).toBeDefined();
	});

	it("should use the provided callback path", () => {
		const router = CREATE_CALLBACK_ROUTE("/custom-path");
		expect(router).toBeDefined();
	});
});
