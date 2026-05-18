import { describe, it, expect } from '@jest/globals';
import { ClassResponseExceptions, ResponseException, HTTP_CODE, ResponseCodes } from '../../src/middleware/responseException';

describe('ClassResponseExceptions', () => {
  describe('ResponseCodes', () => {
    it('should have correct HTTP codes', () => {
      expect(ResponseCodes.Success).toBe(200);
      expect(ResponseCodes.BadRequest).toBe(400);
      expect(ResponseCodes.Unauthorized).toBe(401);
      expect(ResponseCodes.NotFound).toBe(404);
      expect(ResponseCodes.UnknownError).toBe(500);
    });
  });

  describe('HTTP_CODE', () => {
    it('should map keys to themselves', () => {
      expect(HTTP_CODE.Success).toBe('Success');
      expect(HTTP_CODE.BadRequest).toBe('BadRequest');
    });
  });

  describe('response methods', () => {
    it('Success() should return 200', () => {
      const result = new ClassResponseExceptions('ok').Success();
      expect(result.status).toBe(200);
      expect(result.data).toBe('ok');
    });

    it('BadRequest() should return 400', () => {
      const result = ResponseException('invalid').BadRequest();
      expect(result.status).toBe(400);
      expect(result.data).toBe('invalid');
    });

    it('Unauthorized() should return 401', () => {
      const result = ResponseException('no auth').Unauthorized();
      expect(result.status).toBe(401);
    });

    it('NotFound() should return 404', () => {
      const result = ResponseException('not found').NotFound();
      expect(result.status).toBe(404);
      expect(result.data).toBe('not found');
    });

    it('Forbidden() should return 403', () => {
      const result = ResponseException('forbidden').Forbidden();
      expect(result.status).toBe(403);
    });

    it('UnknownError() should return 500', () => {
      const result = ResponseException('error').UnknownError();
      expect(result.status).toBe(500);
    });

    it('should serialize non-string reasons to JSON', () => {
      const result = ResponseException({ code: 'ERR' }).BadRequest();
      expect(result.data).toBe('{"code":"ERR"}');
    });

    it('NoContent() should return 204 with undefined data', () => {
      const result = new ClassResponseExceptions('').NoContent();
      expect(result.status).toBe(204);
      expect(result.data).toBeUndefined();
    });
  });
});
