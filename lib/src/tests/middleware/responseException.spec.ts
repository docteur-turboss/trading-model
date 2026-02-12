import {
  HTTP_CODE,
  ResponseCodes,
  ResponseException,
  ClassResponseExceptions,
} from "../../common/middleware/responseException";
import {describe, expect, test, } from '@jest/globals';

describe("ResponseException System", () => {
  const definitions = [
    ["ServiceUnavailable", 503],
    ["UnknownError", 500],
    ["InvalidToken", 498],
    ["TooManyRequests", 429],
    ["IMATeapot", 418],
    ["PayloadTooLarge", 413],
    ["Gone", 410],
    ["Conflict", 409],
    ["MethodNotAllowed", 405],
    ["NotFound", 404],
    ["Forbidden", 403],
    ["PaymentRequired", 402],
    ["Unauthorized", 401],
    ["BadRequest", 400],
    ["NoContent", 204],
    ["OK", 201],
    ["Success", 200],
  ] as const;

  test("HTTP_CODE should map each key to itself", () => {
    for (const [key] of definitions) {
      expect(HTTP_CODE[key]).toBe(key);
    }
  });

  test("ResponseCodes should map each key to the correct HTTP code", () => {
    for (const [key, value] of definitions) {
      expect(ResponseCodes[key]).toBe(value);
    }
  });

  describe("ClassResponseExceptions", () => {
    test("should store a string reason as-is", () => {
      const err = new ClassResponseExceptions("test");
      expect(err.reason).toBe("test");
    });

    test("should stringify non-string reasons", () => {
      const obj = { msg: "hello" };
      const err = new ClassResponseExceptions(obj);
      expect(err.reason).toBe(JSON.stringify(obj));
    });

    test("should extend Error", () => {
      const err = new ClassResponseExceptions("x");
      expect(err).toBeInstanceOf(Error);
    });

    for (const [key, code] of definitions) {
      test(`.${key}() should return correct status and data`, () => {
        const reason = "example";
        const err = new ClassResponseExceptions(reason);

        const result = err[key]();

        if(key == "NoContent"){
          expect(result).toEqual({
            status: code,
            data: undefined,
          });
        }else {
          expect(result).toEqual({
            status: code,
            data: reason,
          });
        }
      });
    }
  });

  describe("ResponseException factory", () => {
    test("should create an instance of ClassResponseExceptions", () => {
      const e = ResponseException("reason");
      expect(e).toBeInstanceOf(ClassResponseExceptions);
    });

    test("should correctly pass the reason to the class", () => {
      const e = ResponseException("custom");
      expect(e.reason).toBe("custom");
    });

    test("should default to empty reason when none is provided", () => {
      const e = ResponseException();
      expect(e.reason).toBe("");
    });
  });
});