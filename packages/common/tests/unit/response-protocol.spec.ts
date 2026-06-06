import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ResponseProtocole } from '../../src/middleware/response-protocol';
import {
  ServiceNotFoundError,
  ServiceUnreachableError,
  AuthenticationError,
  AddressManagerError,
} from '../../src/utils/errors';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ResponseProtocole', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = { originalUrl: '/test', method: 'GET', ip: '127.0.0.1' };
    res = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should map ServiceNotFoundError to 404', () => {
    const err = new ServiceNotFoundError('Service not found');
    ResponseProtocole(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should map ServiceUnreachableError to 410', () => {
    const err = new ServiceUnreachableError('Service down');
    ResponseProtocole(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('should map AuthenticationError to 498', () => {
    const err = new AuthenticationError('Invalid token');
    ResponseProtocole(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(498);
  });

  it('should map AddressManagerError to 500', () => {
    const err = new AddressManagerError('Generic error');
    ResponseProtocole(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should map unknown errors to 500', () => {
    const err = new Error('Unknown');
    ResponseProtocole(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should accept pre-formatted response objects', () => {
    const err = { status: 418, data: 'teapot' };
    ResponseProtocole(err as any, req, res, next);
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.send).toHaveBeenCalledWith('teapot');
  });

  it('should call next() after sending response', () => {
    const err = new Error('test');
    ResponseProtocole(err, req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
