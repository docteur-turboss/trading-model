import { Response } from "express";
import ChainedError from "chained-error";
import { logger } from "../../common/config/logger";
import { 
  handleCoreResponse,
  handleCoreAuthResponse,
  ensureAtLeastOneField,
  handleDBError,
  handleCoreError,
  handleOnlyDataCore
} from "../../common/middleware/handleCoreResponse";
import { describe, expect, test, beforeEach } from '@jest/globals';

import { HTTP_CODE, ResponseException } from "../../common/middleware/responseException";
import * as ImportedGenerals from "../../common/middleware/responseException";

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("../../common/config/logger", () => ({
  logger: {
    error: jest.fn()
  }
}));

describe("handleCoreResponse", () => {
  let mockResponses: any;

  beforeEach(() => {
    mockResponses = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Mock ResponseException to be a jest spy
    jest.spyOn(ImportedGenerals, "ResponseException").mockImplementation((reason?: unknown) => 
      ({
        Success: () => ({ status: 200, data: reason }),
        UnknownError: () => ({ status: 500, data: reason })
      } as unknown as ImportedGenerals.ClassResponseExceptions)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should call ResponseException and send JSON", async () => {
    await handleCoreResponse(
      () => Promise.resolve(["data", HTTP_CODE.Success]),
      mockResponses as any
    );

    expect(ResponseException).toHaveBeenCalledWith("data");
    expect(mockResponses.status).toHaveBeenCalledWith(200);
    expect(mockResponses.json).toHaveBeenCalledWith({ status: 200, data: "data" });
  });
});


describe("handleCoreAuthResponse", () => {
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  test("should set cookie and send JSON", async () => {
    await handleCoreAuthResponse(() => new Promise((res) => res(["token-value", HTTP_CODE.Success])), mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.cookie).toHaveBeenCalledWith(
      "token",
      "token-value",
      expect.objectContaining({
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: expect.any(Number),
        path: "/"
      })
    );
    expect(mockResponse.json).toHaveBeenCalledWith({ status: 200, data: "token-value" });
  });
});

describe("ensureAtLeastOneField", () => {
  test("should throw if all fields are falsy", () => {
    expect(() => ensureAtLeastOneField({ a: null, b: undefined }))
      .toThrow();
  });

  test("should NOT throw if at least one field is truthy", () => {
    expect(() => ensureAtLeastOneField({ a: null, b: "ok" }))
      .not.toThrow();
  });
});

describe("handleDBError", () => {
  test("should transform 'No result returned' into 404 error", () => {
    const fn = handleDBError("user");

    const error = new ChainedError("No result returned");

    expect(() => fn(error)).toThrow("404");
  });

  test("should map duplicate name error to 'Nom exist'", () => {
    const fn = handleDBError("user");

    const error = new ChainedError("Duplicate entry 'X' for key 'name_UNIQUE'");

    expect(() => fn(error)).toThrow("Nom exist");
  });

  test("should map duplicate email error to 'Email exist'", () => {
    const fn = handleDBError("user");

    const error = new ChainedError("Duplicate entry 'X' for key 'email_UNIQUE'");

    expect(() => fn(error)).toThrow("Email exist");
  });

  test("should log and rethrow unknown errors", () => {
    const fn = handleDBError("user");
    const err = new Error("unknown");

    expect(() => fn(err)).toThrow(err);
    expect(logger.error).toHaveBeenCalledWith("user.models.ts", { err });
  });
});

describe("handleCoreError", () => {
  test("should return mapped error tuple when match found", () => {
    const mapping : Record<string, [string, string]> = {
      "NotFound": ["ERR", "ERROR"]
    };

    const e = new Error("NotFound");

    const result = handleCoreError("auth", "login", e, mapping);

    expect(result).toEqual(["ERR", "ERROR"]);
  });

  test("should log and rethrow when no match", () => {
    const mapping = {};
    const e = new Error("NoMatch");

    expect(() => handleCoreError("user", "update", e, mapping)).toThrow(e);
    expect(logger.error).toHaveBeenCalledWith("user.core.ts", {
      err: e,
      context: "update"
    });
  });
});

describe("handleOnlyDataCore", () => {
  test("should return success tuple on success", async () => {
    const fn = () => new Promise((res) => res("DATA"));

    const result = await handleOnlyDataCore(fn, {}, "user", "get");

    expect(result).toEqual(["DATA", HTTP_CODE.Success]);
  });

  test("should pass error to handleCoreError when error occurs", async () => {
    const err = new Error("TEST");
    const fn = () => new Promise(() => {throw err});

    const mapping : Record<string, [string, string]> = {
      "TEST": ["ERR", "ERROR"]
    };

    const result = await handleOnlyDataCore(fn, mapping, "auth", "login");

    expect(result).toEqual(["ERR", "ERROR"]);
  });

  test("should rethrow if handleCoreError rethrows", async () => {
    const err = new Error("X");
    const fn = () => new Promise(() => {throw err});

    const mapping = {}; // no mapping, so handleCoreError will throw

    await expect(handleOnlyDataCore(fn, mapping, "settings", "update"))
      .rejects.toThrow(err);
  });
});