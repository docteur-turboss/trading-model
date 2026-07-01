import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockInc = jest.fn();
const mockObserve = jest.fn();
const mockSet = jest.fn();
const mockMetrics = jest.fn().mockResolvedValue('mock_metrics 1');
const mockContentType = 'text/plain; charset=utf-8';

jest.mock('prom-client', () => {
  const MockRegistry = jest.fn().mockImplementation(() => ({
    contentType: mockContentType,
    metrics: mockMetrics,
  }));

  return {
    Registry: MockRegistry,
    collectDefaultMetrics: jest.fn(),
    Counter: jest.fn().mockImplementation(() => ({ inc: mockInc })),
    Histogram: jest.fn().mockImplementation(() => ({ observe: mockObserve })),
    Gauge: jest.fn().mockImplementation(() => ({ set: mockSet })),
  };
});

import {
  trackRequest,
  observeCleanupDuration,
  setActiveWsConnections,
  metricsHandler,
} from '../../src/monitoring/metrics';
import { Request, Response } from 'express';

describe('metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trackRequest', () => {
    it('should track request metrics without throwing', () => {
      expect(() => {
        trackRequest('GET', '/test', 200, 10);
      }).not.toThrow();
      expect(mockInc).toHaveBeenCalledWith({ method: 'GET', path: '/test', status: 200 });
    });

    it('should handle error status codes', () => {
      expect(() => {
        trackRequest('POST', '/register', 500, 50);
      }).not.toThrow();
    });
  });

  describe('observeCleanupDuration', () => {
    it('should observe cleanup duration without throwing', () => {
      expect(() => {
        observeCleanupDuration(42);
      }).not.toThrow();
      expect(mockObserve).toHaveBeenCalled();
    });
  });

  describe('setActiveWsConnections', () => {
    it('should set WebSocket connection count without throwing', () => {
      expect(() => {
        setActiveWsConnections(5);
      }).not.toThrow();
      expect(mockSet).toHaveBeenCalledWith(5);
    });
  });

  describe('metricsHandler', () => {
    it('should be a function', () => {
      expect(typeof metricsHandler).toBe('function');
    });

    it('should return Prometheus metrics content type', async () => {
      const req = {} as Request;
      const res = {
        setHeader: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      await metricsHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text/plain'));
      expect(res.end).toHaveBeenCalledWith('mock_metrics 1');
    });
  });
});
