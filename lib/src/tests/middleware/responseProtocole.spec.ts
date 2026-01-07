import { ResponseProtocole } from "../../common/middleware/responseProtocole";
import { describe, expect, test, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from "express";
import { logger } from "../../common/config/logger";

import {
  AuthenticationError,
  ServiceNotFoundError,
  ServiceUnreachableError,
  AddressManagerBaseError,
} from "../../common/utils/Errors";

jest.mock("../../common/config/logger", () => ({
  logger: { error: jest.fn() }
}));

const mockResponse = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe("ResponseProtocole middleware", () => {
  let req: Partial<Request>;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      originalUrl: "/test",
      method: "GET",
      ip: "127.0.0.1"
    };
    res = mockResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------
  // Already formatted object
  // -------------------------------------------------------
  test("should respond with a provided ResponseObject without mapping", () => {
    const respObj = { status: 400, data: "Bad request" };
    ResponseProtocole(respObj, req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith("Bad request");
    expect(logger.error).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // Standard Error → UnknownError
  // -------------------------------------------------------
  test("should convert Error to UnknownError and respond", () => {
    const err = new Error("Something went wrong");

    ResponseProtocole(err, req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith("Something went wrong");
    expect(res.json).toHaveBeenCalledWith(expect.any(String));
  });

  
  // -------------------------------------------------------
  // ServiceNotFoundError → 404
  // -------------------------------------------------------
  test("should map ServiceNotFoundError to 404 NotFound", () => {
    const err = new ServiceNotFoundError("Not found");
    ResponseProtocole(err, req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith("Not found");
    expect(logger.error).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // ServiceUnreachableError → 410 Gone
  // -------------------------------------------------------
  test("should map ServiceUnreachableError to 410 Gone", () => {
    const err = new ServiceUnreachableError("Unavailable");
    ResponseProtocole(err, req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith("Unavailable");
    expect(logger.error).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // AuthenticationError → 498 InvalidToken
  // -------------------------------------------------------
  test("should map AuthenticationError to 498 InvalidToken", () => {
    const err = new AuthenticationError("Invalid token");
    ResponseProtocole(err, req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(498);
    expect(res.json).toHaveBeenCalledWith("Invalid token");
    expect(logger.error).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // AddressManagerBaseError → UnknownError
  // -------------------------------------------------------
  test("should map AddressManagerBaseError to UnknownError", () => {
    class ConcreteError extends AddressManagerBaseError {
      constructor(msg: string) { super(msg); }
    }
    const err = new ConcreteError("Base error");
    ResponseProtocole(err, req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith("Base error");
    expect(logger.error).toHaveBeenCalledWith("Server error", expect.objectContaining({
      message: "Base error",
      stack: expect.any(String),
      url: "/test",
      method: "GET",
      ip: "127.0.0.1",
    }));
  });
  
  test("should respond with provided response object without modification", () => {
    const errObj = { status: 400, data: "Bad request" };

    ResponseProtocole(errObj, req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith("Bad request");
  });

  test("should log server errors (status >= 500)", () => {
    const err = new Error("Critical error");

    ResponseProtocole(err, req as Request, res, next);
    expect(logger.error).toHaveBeenCalledWith("Server error", expect.objectContaining({
      message: "Critical error",
      stack: expect.any(String),
      url: "/test",
      method: "GET",
      ip: "127.0.0.1"
    }));
  });

  test("should NOT log client errors (status < 500)", () => {
    const errObj = { status: 400, data: "Bad request" };

    ResponseProtocole(errObj, req as Request, res, next);

    expect(logger.error).not.toHaveBeenCalled();
  });

  test("should send JSON response correctly", () => {
    const err = new Error("Server failure");

    ResponseProtocole(err, req as Request, res, next);

    expect(res.status).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  test("next() is not called after sending response", () => {
    const err = new Error("Server failure");

    ResponseProtocole(err, req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});