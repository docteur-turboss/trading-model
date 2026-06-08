import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { catchSync } from '../../src/middleware/catch-error';

 

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
    const wrapped = catchSync(handler as any);

    await wrapped(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
  });

  it('should forward synchronous errors to next', async () => {
    const error = new Error('sync error');
    const handler = () => {
      throw error;
    };
    const wrapped = catchSync(handler as any);

    await wrapped(req as any, res as any, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should catch asynchronous errors and pass to next', async () => {
    const error = new Error('async error');
    const handler = async () => {
      throw error;
    };
    const wrapped = catchSync(handler as any);

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should not call next if handler succeeds', async () => {
    const handler = jest.fn();
    const wrapped = catchSync(handler as any);

    await wrapped(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('should send response object via res when handler returns ResponseObject', async () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    const handler = () => ({ status: 201, data: { id: 'abc' } });
    const wrapped = catchSync(handler as any);

    await wrapped(req, mockRes as any, next);

    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.send).toHaveBeenCalledWith({ id: 'abc' });
    expect(next).not.toHaveBeenCalled();
  });
});
