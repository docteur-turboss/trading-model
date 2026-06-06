import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/middleware/catch-error', () => ({
  catchSync: jest.fn(fn => fn),
}));

jest.mock('../../src/middleware/response-exception', () => ({
  ResponseException: (data: any) => ({
    Forbidden: () => {
      throw Object.assign(new Error(JSON.stringify({ error: 'mTLS authorization failed', data })), {
        status: 403,
      });
    },
    Unauthorized: () => {
      throw Object.assign(
        new Error(JSON.stringify(data ?? { error: 'Client certificate required' })),
        {
          status: 401,
        }
      );
    },
  }),
}));

import { MTLSAuthMiddleware } from '../../src/middleware/mtls-auth';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('MTLSAuthMiddleware', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = { socket: {} };
    res = {};
    next = jest.fn();
  });

  it('should throw Forbidden when socket is not a TLSSocket', () => {
    req.socket = { constructor: { name: 'Socket' } };

    expect(() => MTLSAuthMiddleware(req, res, next)).toThrow();
  });

  it('should throw Forbidden when socket is not authorized', () => {
    req.socket = {
      authorized: false,
      authorizationError: 'unauthorized client',
      getPeerCertificate: jest.fn(),
    };

    expect(() => MTLSAuthMiddleware(req, res, next)).toThrow();
  });

  it('should throw Unauthorized when no client certificate', () => {
    req.socket = {
      authorized: true,
      authorizationError: undefined,
      getPeerCertificate: jest.fn(() => ({})),
    };

    expect(() => MTLSAuthMiddleware(req, res, next)).toThrow();
  });

  it('should extract identity from subjectaltname', () => {
    const cert = {
      subjectaltname: 'DNS:my-service',
      subject: { CN: 'fallback-cn' },
    };
    req.socket = {
      authorized: true,
      authorizationError: undefined,
      getPeerCertificate: jest.fn(() => cert),
    };

    MTLSAuthMiddleware(req, res, next);

    expect(req.clientIdentity).toBe('DNS:my-service');
    expect(next).toHaveBeenCalled();
  });

  it('should handle multiple subjectAltNames by joining with comma', () => {
    const cert = {
      subjectaltname: ['DNS:service-a', 'DNS:service-b'],
      subject: { CN: 'fallback-cn' },
    };
    req.socket = {
      authorized: true,
      authorizationError: undefined,
      getPeerCertificate: jest.fn(() => cert),
    };

    MTLSAuthMiddleware(req, res, next);

    expect(req.clientIdentity).toBe('DNS:service-a, DNS:service-b');
    expect(next).toHaveBeenCalled();
  });

  it('should fallback to CN when subjectaltname is not available', () => {
    const cert = {
      subjectaltname: undefined,
      subject: { CN: 'my-service-cn' },
    };
    req.socket = {
      authorized: true,
      authorizationError: undefined,
      getPeerCertificate: jest.fn(() => cert),
    };

    MTLSAuthMiddleware(req, res, next);

    expect(req.clientIdentity).toBe('my-service-cn');
    expect(next).toHaveBeenCalled();
  });

  it('should throw Unauthorized when neither SAN nor CN is available', () => {
    const cert = {
      subjectaltname: undefined,
      subject: { CN: undefined },
    };
    req.socket = {
      authorized: true,
      authorizationError: undefined,
      getPeerCertificate: jest.fn(() => cert),
    };

    expect(() => MTLSAuthMiddleware(req, res, next)).toThrow();
    expect(next).not.toHaveBeenCalled();
  });
});
