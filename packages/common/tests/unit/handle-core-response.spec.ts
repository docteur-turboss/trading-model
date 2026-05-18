import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleCoreResponse, handleCoreAuthResponse, ensureAtLeastOneField, handleOnlyDataCore, handleCoreError, handleDBError } from '../../src/middleware/handleCoreResponse';

describe('handleCoreResponse', () => {
  let res: any;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
    };
  });

  describe('handleCoreResponse', () => {
    it('should format and send a success response', async () => {
      const coreFn = jest.fn<any>().mockResolvedValue(['data', 'Success']);

      await handleCoreResponse(coreFn, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200, data: 'data' })
      );
    });
  });

  describe('handleCoreAuthResponse', () => {
    it('should set auth cookie and send response', async () => {
      const coreFn = jest.fn<any>().mockResolvedValue(['token-value', 'Success']);

      await handleCoreAuthResponse(coreFn, res);

      expect(res.cookie).toHaveBeenCalledWith('token', 'token-value', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('ensureAtLeastOneField', () => {
    it('should throw if all fields are falsy', () => {
      expect(() => ensureAtLeastOneField({ name: '', age: null })).toThrow();
    });

    it('should not throw if at least one field is truthy', () => {
      expect(() => ensureAtLeastOneField({ name: 'John', age: null })).not.toThrow();
    });
  });

  describe('handleOnlyDataCore', () => {
    it('should return tuple with data and Success code', async () => {
      const fn = jest.fn<any>().mockResolvedValue({ id: 1 });
      const result = await handleOnlyDataCore(fn, {}, 'user' as any, 'test');
      expect(result).toEqual([{ id: 1 }, 'Success']);
    });

    it('should map errors using provided mapping', async () => {
      const fn = jest.fn<any>().mockRejectedValue(new Error('NOT_FOUND'));
      const result = await handleOnlyDataCore(
        fn, { 'NOT_FOUND': ['404', 'Not found'] }, 'user' as any, 'test'
      );
      expect(result).toEqual(['404', 'Not found']);
    });
  });
});
