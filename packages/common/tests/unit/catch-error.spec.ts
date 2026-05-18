import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { catchSync } from '../../src/middleware/catchError';

describe('catchSync', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = {};
    res = {};
    next = jest.fn();
  });

  it('should call the wrapped function with req, res, next', async () => {
    const handler = jest.fn();
    const wrapped = catchSync(handler);

    await wrapped(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
  });

  it('should reject the promise on synchronous errors', async () => {
    const error = new Error('sync error');
    const handler = () => { throw error; };
    const wrapped = catchSync(handler as any);

    await expect(wrapped(req as any, res as any, next)).rejects.toThrow(error);
    expect(next).not.toHaveBeenCalled();
  });

  it('should catch asynchronous errors and pass to next', async () => {
    const error = new Error('async error');
    const handler = async () => { throw error; };
    const wrapped = catchSync(handler);

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should not call next if handler succeeds', async () => {
    const handler = jest.fn();
    const wrapped = catchSync(handler);

    await wrapped(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});
