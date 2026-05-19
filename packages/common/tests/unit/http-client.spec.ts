import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('https');

import { HttpClient, HttpClientError, HttpClientTimeoutError } from '../../src/config/http-client';
import https from 'https';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
      const promise = client.get('https://example.com/api', { timeoutMs: 100 });
      mockReq._timeoutCb();

      await expect(promise).rejects.toThrow(HttpClientTimeoutError);
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
});
