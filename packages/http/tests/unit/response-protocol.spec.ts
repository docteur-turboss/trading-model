import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	authenticationError,
	configurationError,
	ErrorCode,
	makeErrorCode,
} from "@trading-model/common/utils/errors";
import { ResponseProtocol } from "@trading-model/http/adapters/inbound/response-protocol";

const addressManagerError = makeErrorCode(ErrorCode.AddressManager, 503);
const serviceNotFoundError = makeErrorCode(ErrorCode.ServiceNotFound, 404);
const serviceUnreachableError = makeErrorCode(
	ErrorCode.ServiceUnreachable,
	410
);

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

	it("should map unknown errors to 500 without exposing their message", () => {
		const err = new Error("connect ECONNREFUSED 10.0.0.5:27017");
		ResponseProtocol(err, req, res, next);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
	});

	it("should send the message of an anticipated error as an ErrorResponse", () => {
		ResponseProtocol(serviceNotFoundError("Service not found"), req, res, next);
		expect(res.json).toHaveBeenCalledWith({ error: "Service not found" });
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
		expect(res.json).toHaveBeenCalledWith({ error: "teapot" });
	});

	it("should keep a pre-formatted object body", () => {
		const err = { status: 401, data: { error: "Missing token" } };
		ResponseProtocol(err as any, req, res, next);
		expect(res.json).toHaveBeenCalledWith({ error: "Missing token" });
	});

	it("should log server error for pre-formatted 500 response", () => {
		const err = { status: 500, data: "Internal error" };
		ResponseProtocol(err as any, req, res, next);
		expect(res.status).toHaveBeenCalledWith(500);
	});

	it("should send response without calling next", () => {
		const err = new Error("test");
		ResponseProtocol(err, req, res, next);
		expect(res.json).toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();
	});
});
