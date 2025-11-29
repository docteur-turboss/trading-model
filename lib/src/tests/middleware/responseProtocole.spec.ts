import { ResponseProtocole } from "../../common/middleware/responseProtocole";
import { describe, expect, test, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from "express";
import { logger } from "../../common/config/logger";

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

  test("should convert Error to UnknownError and respond", () => {
    const err = new Error("Something went wrong");

    ResponseProtocole(err, req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.any(String));
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

    expect(logger.error).toHaveBeenCalledWith("Server Error", expect.objectContaining({
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