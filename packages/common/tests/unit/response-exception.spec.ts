import { describe, it, expect } from '@jest/globals';
import {
  ClassResponseExceptions,
  ResponseException,
  HTTP_CODE,
  ResponseCodes,
} from '../../src/middleware/response-exception';

describe('ClassResponseExceptions', () => {
  describe('ResponseCodes', () => {
    it('should have correct HTTP codes for all methods', () => {
      expect(ResponseCodes.Success).toBe(200);
      expect(ResponseCodes.OK).toBe(201);
      expect(ResponseCodes.NoContent).toBe(204);
      expect(ResponseCodes.BadRequest).toBe(400);
      expect(ResponseCodes.Unauthorized).toBe(401);
      expect(ResponseCodes.PaymentRequired).toBe(402);
      expect(ResponseCodes.Forbidden).toBe(403);
      expect(ResponseCodes.NotFound).toBe(404);
      expect(ResponseCodes.MethodNotAllowed).toBe(405);
      expect(ResponseCodes.Conflict).toBe(409);
      expect(ResponseCodes.Gone).toBe(410);
      expect(ResponseCodes.PayloadTooLarge).toBe(413);
      expect(ResponseCodes.IMATeapot).toBe(418);
      expect(ResponseCodes.TooManyRequests).toBe(429);
      expect(ResponseCodes.InvalidToken).toBe(498);
      expect(ResponseCodes.UnknownError).toBe(500);
      expect(ResponseCodes.ServiceUnavailable).toBe(503);
    });
  });

  describe('HTTP_CODE', () => {
    it('should map keys to themselves', () => {
      expect(HTTP_CODE.Success).toBe('Success');
      expect(HTTP_CODE.BadRequest).toBe('BadRequest');
      expect(HTTP_CODE.NotFound).toBe('NotFound');
      expect(HTTP_CODE.UnknownError).toBe('UnknownError');
    });
  });

  describe('response methods', () => {
    it('Success() should return 200', () => {
      const result = new ClassResponseExceptions('ok').Success();
      expect(result.status).toBe(200);
      expect(result.data).toBe('ok');
    });

    it('OK() should return 201', () => {
      const result = ResponseException('created').OK();
      expect(result.status).toBe(201);
      expect(result.data).toBe('created');
    });

    it('NoContent() should return 204 with undefined data', () => {
      const result = new ClassResponseExceptions('').NoContent();
      expect(result.status).toBe(204);
      expect(result.data).toBeUndefined();
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

    it('PaymentRequired() should return 402', () => {
      const result = ResponseException('payment').PaymentRequired();
      expect(result.status).toBe(402);
    });

    it('Forbidden() should return 403', () => {
      const result = ResponseException('forbidden').Forbidden();
      expect(result.status).toBe(403);
    });

    it('NotFound() should return 404', () => {
      const result = ResponseException('not found').NotFound();
      expect(result.status).toBe(404);
      expect(result.data).toBe('not found');
    });

    it('MethodNotAllowed() should return 405', () => {
      const result = ResponseException('bad method').MethodNotAllowed();
      expect(result.status).toBe(405);
    });

    it('Conflict() should return 409', () => {
      const result = ResponseException('conflict').Conflict();
      expect(result.status).toBe(409);
    });

    it('Gone() should return 410', () => {
      const result = ResponseException('gone').Gone();
      expect(result.status).toBe(410);
    });

    it('PayloadTooLarge() should return 413', () => {
      const result = ResponseException('too big').PayloadTooLarge();
      expect(result.status).toBe(413);
    });

    it('IMATeapot() should return 418', () => {
      const result = ResponseException('teapot').IMATeapot();
      expect(result.status).toBe(418);
    });

    it('TooManyRequests() should return 429', () => {
      const result = ResponseException('rate limit').TooManyRequests();
      expect(result.status).toBe(429);
    });

    it('InvalidToken() should return 498', () => {
      const result = ResponseException('bad token').InvalidToken();
      expect(result.status).toBe(498);
    });

    it('UnknownError() should return 500', () => {
      const result = ResponseException('error').UnknownError();
      expect(result.status).toBe(500);
    });

    it('ServiceUnavailable() should return 503', () => {
      const result = ResponseException('down').ServiceUnavailable();
      expect(result.status).toBe(503);
    });

    it('should serialize non-string reasons to JSON', () => {
      const result = ResponseException({ code: 'ERR' }).BadRequest();
      expect(result.data).toBe('{"code":"ERR"}');
    });

    it('should handle null reason', () => {
      const result = ResponseException(null).BadRequest();
      expect(result.data).toBe('null');
    });

    it('should handle numeric reason', () => {
      const result = ResponseException(42).Success();
      expect(result.data).toBe('42');
    });
  });

  describe('default empty reason', () => {
    it('should default to empty string', () => {
      const result = ResponseException().Success();
      expect(result.data).toBe('');
    });
  });
});
