import { pingController } from "./ping.controller";
import { Response } from "express";
import { ResponseException } from "../../common/middleware/responseException";

jest.mock("../../common/middleware/responseException");

/* eslint-disable */

describe("pingController", () => {
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as Partial<Response>;

    jest.clearAllMocks();
  });

  test("should respond with OK and pong", () => {
    // Arrange: mock ResponseException.OK() to return expected object
    (ResponseException as jest.Mock).mockReturnValue({
      OK: jest.fn().mockReturnValue({ status: 200, data: "pong" }),
    });

    // Act
    pingController({} as any, mockRes as Response);

    // Assert
    expect(ResponseException).toHaveBeenCalledWith("pong");
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith("pong");
  });
});