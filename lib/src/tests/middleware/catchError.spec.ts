import { catchSync } from '../../common/middleware/catchError';
import { Request, Response, NextFunction } from 'express';

describe('catchError.ts', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction = jest.fn();


  beforeEach(() => {
    req = {} as Request;
    res = {} as Response;
    next = jest.fn();
  });

  test('should call the wrapped function when no error occurs', async () => {
    const handler = jest.fn(async () => {
      // No error throw here
    })

    const wrapped = catchSync(handler);

    await wrapped(req as Request, res as Response, next);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled(); // next should NOT receive an error
  });

  test('should forward synchronous errors to next()', async () => {
    const error = new Error('sync error');

    const handler = jest.fn(async () => {
      throw error;
    });

    const wrapped = catchSync(handler);

    await wrapped(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test('should forward async thrown errors to next()', async () => {
    const error = new Error('async error');

    const handler = jest.fn(async () => {
      throw error;
    });

    const wrapped = catchSync(handler);

    await wrapped(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test('should forward rejected promises to next()', async () => {
    const error = new Error('promise rejection');

    const handler = jest.fn(() => Promise.reject(error));

    const wrapped = catchSync(handler);

    await wrapped(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test('should pass req, res, next correctly to the handler', async () => {
    const handler = jest.fn();

    const wrapped = catchSync(handler);
    await wrapped(req as Request, res as Response, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
  });
});