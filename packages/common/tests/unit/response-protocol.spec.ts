import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ResponseProtocol } from "../../src/middleware/response-protocol";
import {
	addressManagerError,
	authenticationError,
	configurationError,
	serviceNotFoundError,
	serviceUnreachableError,
} from "../../src/utils/errors";

describe("ResponseProtocol", () => {
	let req: any;
	let res: any;
	let next: jest.Mock;

	beforeEach(() => {
		req = { originalUrl: "/test", method: "GET", ip: "127.0.0.1" };
		res = {
			status: jest.fn().mockReturnThis(),
			type: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
		};
		next = jest.fn();
	});

	it("should map SERVICE_NOT_FOUND to 404", () => {
		const err = serviceNotFoundError("Service not found");
		ResponseProtocol(err, req, res, next);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it("should map SERVICE_UNREACHABLE to 410", () => {
		const err = serviceUnreachableError("Service down");
		ResponseProtocol(err, req, res, next);
		expect(res.status).toHaveBeenCalledWith(410);
	});

	it("should map AUTHENTICATION_ERROR to 498", () => {
		const err = authenticationError("Invalid token");
		ResponseProtocol(err, req, res, next);
		expect(res.status).toHaveBeenCalledWith(498);
	});

	it("should map ADDRESS_MANAGER_ERROR to 503", () => {
		const err = addressManagerError("Generic error");
		ResponseProtocol(err, req, res, next);
		expect(res.status).toHaveBeenCalledWith(503);
	});

	it("should map unknown errors to 500", () => {
		const err = new Error("Unknown");
		ResponseProtocol(err, req, res, next);
		expect(res.status).toHaveBeenCalledWith(500);
	});

	it("should map ConfigurationError to 500", () => {
		const err = configurationError("Config error");
		ResponseProtocol(err, req, res, next);
		expect(res.status).toHaveBeenCalledWith(500);
	});

	it("should accept pre-formatted response objects", () => {
		const err = { status: 418, data: "teapot" };
		ResponseProtocol(err as any, req, res, next);
		expect(res.status).toHaveBeenCalledWith(418);
		expect(res.send).toHaveBeenCalledWith("teapot");
	});

	it("should log server error for pre-formatted 500 response", () => {
		const err = { status: 500, data: "Internal error" };
		ResponseProtocol(err as any, req, res, next);
		expect(res.status).toHaveBeenCalledWith(500);
	});

	it("should send response without calling next", () => {
		const err = new Error("test");
		ResponseProtocol(err, req, res, next);
		expect(res.send).toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();
	});
});
