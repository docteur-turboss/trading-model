import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';

jest.mock('https');
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(() => Promise.resolve()),
    readFile: jest.fn((path: string) => Promise.resolve(`content-of-${path}`)),
  },
  constants: { R_OK: 4 },
  readFileSync: jest.fn(),
}));

import fs from 'node:fs';
import { HttpClient, HttpClientError, HttpClientTimeoutError } from '../../src/config/http-client';
import https from 'https';

describe('HttpClient', () => {
  let client: HttpClient;
  let requestCallback: ((res: any) => void) | null;
  let mockReq: any;

  beforeEach(() => {
    requestCallback = null;
    mockReq = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      setTimeout: jest.fn((ms: number, cb: () => void) => {
        mockReq._timeoutCb = cb;
        return mockReq;
      }),
      destroy: jest.fn(),
    };

    (https.request as jest.Mock).mockImplementation((_opts: any, cb: any) => {
      requestCallback = cb;
      return mockReq;
    });

    client = new HttpClient();
  });

  describe('constructor', () => {
    it('should not read TLS files eagerly when tlsConfig is provided', () => {
      const tlsClient = new HttpClient({
        ca: '/path/to/ca.pem',
        cert: '/path/to/cert.pem',
        key: '/path/to/key.pem',
      });

      expect((fs as any).promises.readFile).not.toHaveBeenCalled();
      expect(tlsClient).toBeInstanceOf(HttpClient);
    });

    it('should not read TLS files when tlsConfig is empty', () => {
      (fs as any).promises.readFile.mockClear();

      new HttpClient({});

      expect((fs as any).promises.readFile).not.toHaveBeenCalled();
    });
  });

  function simulateResponse(statusCode: number, body: string, contentType: string) {
    (requestCallback as any)({
      on: jest.fn((e: string, cb2: any) => {
        if (e === 'data') cb2(body);
        if (e === 'end') cb2();
      }),
      statusCode,
      headers: { 'content-type': contentType },
    });
  }

  function simulateRawResponse(statusCode: number, contentType: string) {
    const onMock = jest.fn((e: string, cb2: any) => {
      if (e === 'data') cb2('{invalid json}');
      if (e === 'end') cb2();
    });
    (requestCallback as any)({
      on: onMock,
      statusCode,
      headers: { 'content-type': contentType },
    });
    return onMock;
  }

  describe('get', () => {
    it('should make a GET request', async () => {
      const responseData = JSON.stringify({ data: 'test' });

      const promise = client.get('https://example.com/api');
      simulateResponse(200, responseData, 'application/json');

      const result = await promise;
      expect(result).toEqual({ data: 'test' });
    });

    it('should reject on HTTP error status', async () => {
      const promise = client.get('https://example.com/api');
      simulateResponse(404, '', 'text/plain');

      await expect(promise).rejects.toThrow(HttpClientError);
    });

    it('should reject on request error', async () => {
      const promise = client.get('https://example.com/api');
      mockReq.on.mock.calls[0][1](new Error('connection failed'));

      await expect(promise).rejects.toThrow('connection failed');
    });

    it('should reject on timeout', async () => {
      const promise = client.get('https://example.com/api', { timeoutMs: 100, retryCount: 0 });
      mockReq._timeoutCb();

      await expect(promise).rejects.toThrow(HttpClientTimeoutError);
    });

    it('should reject on JSON parse error', async () => {
      const promise = client.get('https://example.com/api');
      simulateRawResponse(200, 'application/json');

      await expect(promise).rejects.toThrow();
    });

    it('should handle request with timeout that completes normally', async () => {
      const responseData = JSON.stringify({ data: 'ok' });
      const promise = client.get('https://example.com/api', { timeoutMs: 1000 });
      simulateResponse(200, responseData, 'application/json');

      const result = await promise;
      expect(result).toEqual({ data: 'ok' });
    });

    it('should handle response without content-type header', async () => {
      const promise = client.get('https://example.com/api');
      (requestCallback as any)({
        on: jest.fn((e: string, cb2: any) => {
          if (e === 'data') cb2('raw-string-data');
          if (e === 'end') cb2();
        }),
        statusCode: 200,
        headers: {},
      });

      const result = await promise;
      expect(result).toBe('raw-string-data');
    });
  });

  describe('post', () => {
    it('should make a POST request with body', async () => {
      const promise = client.post('https://example.com/api', { name: 'test' });
      simulateResponse(201, JSON.stringify({ id: 1 }), 'application/json');

      const result = await promise;
      expect(result).toEqual({ id: 1 });
      expect(mockReq.write).toHaveBeenCalledWith(JSON.stringify({ name: 'test' }));
    });

    it('should handle 204 No Content', async () => {
      const promise = client.post('https://example.com/api');
      simulateResponse(204, '', 'text/plain');

      const result = await promise;
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should make a DELETE request', async () => {
      const promise = client.delete('https://example.com/api/1');
      simulateResponse(200, 'true', 'text/plain');

      const result = await promise;
      expect(result).toBe('true');
    });
  });

  describe('schema validation', () => {
    it('should validate JSON response with schema', async () => {
      const responseData = JSON.stringify({ data: 'test' });
      const schema = z.object({ data: z.string() });

      const promise = client.get('https://example.com/api', undefined, schema);
      simulateResponse(200, responseData, 'application/json');

      const result = await promise;
      expect(result).toEqual({ data: 'test' });
    });

    it('should reject when JSON response does not match schema', async () => {
      const responseData = JSON.stringify({ data: 123 });
      const schema = z.object({ data: z.string() });

      const promise = client.get('https://example.com/api', undefined, schema);
      simulateResponse(200, responseData, 'application/json');

      await expect(promise).rejects.toThrow(z.ZodError);
    });

    it('should validate non-JSON response with schema', async () => {
      const schema = z.literal('raw-string');

      const promise = client.get('https://example.com/api', undefined, schema);
      (requestCallback as any)({
        on: jest.fn((e: string, cb2: any) => {
          if (e === 'data') cb2('raw-string');
          if (e === 'end') cb2();
        }),
        statusCode: 200,
        headers: {},
      });

      const result = await promise;
      expect(result).toBe('raw-string');
    });

    it('should reject when non-JSON response does not match schema', async () => {
      const schema = z.literal('expected');

      const promise = client.get('https://example.com/api', undefined, schema);
      (requestCallback as any)({
        on: jest.fn((e: string, cb2: any) => {
          if (e === 'data') cb2('actual');
          if (e === 'end') cb2();
        }),
        statusCode: 200,
        headers: {},
      });

      await expect(promise).rejects.toThrow(z.ZodError);
    });

    it('should validate post response with schema', async () => {
      const responseData = JSON.stringify({ id: 1, name: 'test' });
      const schema = z.object({ id: z.number(), name: z.string() });

      const promise = client.post('https://example.com/api', { name: 'test' }, undefined, schema);
      simulateResponse(201, responseData, 'application/json');

      const result = await promise;
      expect(result).toEqual({ id: 1, name: 'test' });
    });
  });

  describe('createWithTls', () => {
    it('should create HttpClient with TLS paths (lazy load)', () => {
      (fs as any).promises.readFile.mockClear();
      (fs as any).promises.access.mockClear();

      const client = HttpClient.createWithTls({
        RootCACertPath: '/etc/ca.pem',
        CertificatePath: '/etc/cert.pem',
        KeyCertificatePath: '/etc/key.pem',
      });

      expect(client).toBeInstanceOf(HttpClient);
      expect((fs as any).promises.readFile).not.toHaveBeenCalled();
    });
  });

  describe('TLS error handling', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (fs as any).promises.access.mockReset();
      (fs as any).promises.readFile.mockReset();
    });

    it('should throw descriptive error when TLS file cannot be read (Error thrown)', async () => {
      (fs as any).promises.access.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      const client = new HttpClient({ ca: '/bad/path.pem' });
      const promise = client.get('https://example.com/api');

      await expect(promise).rejects.toThrow(
        'Failed to read TLS CA certificate from "/bad/path.pem"'
      );
    });

    it('should handle non-Error rejection from TLS file read', async () => {
      (fs as any).promises.access.mockRejectedValueOnce('string error');

      const client = new HttpClient({ ca: '/bad/path.pem' });
      const promise = client.get('https://example.com/api');

      await expect(promise).rejects.toThrow(
        'Failed to read TLS CA certificate from "/bad/path.pem"'
      );
    });
  });

  describe('request close handling', () => {
    it('should clean up timeout listener on request close after normal completion', async () => {
      mockReq.removeListener = jest.fn();
      mockReq.destroyed = false;

      const promise = client.get('https://example.com/api', { timeoutMs: 1000 });
      simulateResponse(200, JSON.stringify({ ok: true }), 'application/json');

      const closeCall = mockReq.on.mock.calls.find((c: unknown[]) => c[0] === 'close');
      const closeHandler = closeCall![1] as () => void;
      closeHandler();

      await promise;

      expect(mockReq.removeListener).toHaveBeenCalledWith('timeout', expect.any(Function));
    });

    it('should not clean up timeout listener when request was destroyed', async () => {
      mockReq.removeListener = jest.fn();
      mockReq.destroyed = true;

      const promise = client.get('https://example.com/api', { timeoutMs: 1000 });
      simulateResponse(200, JSON.stringify({ ok: true }), 'application/json');

      const closeCall = mockReq.on.mock.calls.find((c: unknown[]) => c[0] === 'close');
      const closeHandler = closeCall![1] as () => void;
      closeHandler();

      await promise;

      expect(mockReq.removeListener).not.toHaveBeenCalled();
    });
  });

  describe('non-Error rejection handling', () => {
    it('should handle non-Error reject in JSON parse', async () => {
      jest.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        throw 'parse-error-string';
      });

      const promise = client.get('https://example.com/api');
      simulateResponse(200, JSON.stringify({ ok: true }), 'application/json');

      await expect(promise).rejects.toThrow('parse-error-string');
      jest.restoreAllMocks();
    });
  });
});
