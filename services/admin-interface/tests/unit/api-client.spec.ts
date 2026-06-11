import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, setAdminToken } from '../../src/api/api-client';
import { ApiError } from '../../src/types/dtos';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('api-client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setAdminToken('test-token');
  });

  function mockResponse(data: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
      statusText: status === 404 ? 'Not Found' : 'OK',
    };
  }

  describe('getServices', () => {
    it('should fetch service registry', async () => {
      const registry = {
        services: [
          {
            serviceName: 'api-gateway',
            instances: [
              {
                instanceId: '1',
                host: '10.0.1.12',
                port: 8080,
                version: 'v2.4.1',
                heartbeat: '2s ago',
                status: 'healthy',
                ipPort: '10.0.1.12:8080',
              },
            ],
          },
        ],
        topology: [],
      };
      mockFetch.mockResolvedValue(mockResponse(registry));

      const result = await api.getServices();
      expect(result).toEqual(registry);
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/discovery/registry',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'x-api-key': 'test-token' }),
        })
      );
    });
  });

  describe('banInstance', () => {
    it('should send DELETE request', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.banInstance('api-gateway', 'inst-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/discovery/services/api-gateway/instances/inst-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('getAuditEvents', () => {
    it('should build query params from filter', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ events: [], total: 0, page: 0, limit: 5, volumeByTopic: [] })
      );
      await api.getAuditEvents({ topic: 'AUTH', correlationId: 'abc' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('topic=AUTH');
      expect(url).toContain('correlationId=abc');
    });

    it('should skip undefined and empty params', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ events: [], total: 0, page: 0, limit: 5, volumeByTopic: [] })
      );
      await api.getAuditEvents({});
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('/v1/audit/events');
    });
  });

  describe('getJobs', () => {
    it('should fetch job list', async () => {
      const jobList = {
        jobs: [
          {
            id: 'JOB-8821',
            type: 'IMAGE_PROCESSING',
            priority: 'HIGH',
            status: 'in_progress',
            worker: 'worker-node-04',
          },
        ],
        stats: { pending: 24, inProgress: 8, failed: 2 },
      };
      mockFetch.mockResolvedValue(mockResponse(jobList));
      const result = await api.getJobs();
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].id).toBe('JOB-8821');
    });
  });

  describe('getJobDetail', () => {
    it('should fetch job detail by id', async () => {
      const detail = {
        id: 'JOB-8821',
        type: 'IMAGE_PROCESSING',
        priority: 'HIGH',
        status: 'in_progress',
        worker: 'worker-node-04',
        timeline: [
          { event: 'Job Created', timestamp: '2024-05-20 14:30:05', description: 'Job submitted' },
        ],
        payload: {},
        logs: [],
      };
      mockFetch.mockResolvedValue(mockResponse(detail));
      const result = await api.getJobDetail('JOB-8821');
      expect(result.id).toBe('JOB-8821');
      expect(mockFetch).toHaveBeenCalledWith('/v1/jobs/JOB-8821', expect.any(Object));
    });
  });

  describe('cancelJob', () => {
    it('should send PATCH with cancelled status', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.cancelJob('JOB-8821');
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/jobs/JOB-8821/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelled' }),
        })
      );
    });
  });

  describe('getDlqMessages', () => {
    it('should fetch DLQ messages', async () => {
      const dlqResponse = {
        messages: [
          {
            id: 'msg-1',
            timestamp: '2024-05-20 14:32:01',
            topic: 'orders.processing',
            messageId: 'msg-7721',
            failureReason: 'Timeout',
            attempts: 3,
            payloadPreview: '{"order_id": "ORD-990"}',
          },
        ],
        stats: { pending: 12, retryRate: 28.4, totalSize: 2.4, lastIncident: '2 min ago' },
      };
      mockFetch.mockResolvedValue(mockResponse(dlqResponse));
      const result = await api.getDlqMessages();
      expect(result.messages).toHaveLength(1);
      expect(result.stats.pending).toBe(12);
    });
  });

  describe('purgeDlq', () => {
    it('should send DELETE request', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.purgeDlq();
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/messages/dlq',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('getCacheEntries', () => {
    it('should fetch cache entries', async () => {
      const cacheResponse = {
        entries: [
          {
            key: 'auth:user:session:88291',
            service: 'auth-service',
            expiration: '12m 4s',
            size: '1.2 KB',
            lastAccess: '2s ago',
          },
        ],
        stats: { hitRate: 94.2, activeEntries: 1200000 },
      };
      mockFetch.mockResolvedValue(mockResponse(cacheResponse));
      const result = await api.getCacheEntries();
      expect(result.stats.hitRate).toBe(94.2);
    });
  });

  describe('invalidateCache', () => {
    it('should DELETE single key when provided', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.invalidateCache('auth:user:session:1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/gateway/cache/auth:user:session:1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should DELETE all when no key provided', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.invalidateCache();
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/gateway/cache',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('getWorkers', () => {
    it('should fetch workers', async () => {
      const workerResponse = {
        workers: [
          {
            id: 'WRK-8829',
            ip: '10.0.4.122',
            region: 'eu-west-1',
            cpu: 74,
            ram: 62,
            status: 'Online',
            heartbeat: '2s ago',
            activeJobs: 14,
          },
        ],
        stats: {
          activeWorkers: 42,
          totalWorkers: 48,
          avgCpu: 44.2,
          totalJobsPerMin: 1240,
          clusterMemory: 342,
        },
      };
      mockFetch.mockResolvedValue(mockResponse(workerResponse));
      const result = await api.getWorkers();
      expect(result.workers).toHaveLength(1);
      expect(result.stats.activeWorkers).toBe(42);
    });
  });

  describe('drainWorker', () => {
    it('should send PATCH with draining status', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.drainWorker('WRK-8829');
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/workers/WRK-8829/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'draining' }),
        })
      );
    });
  });

  describe('getCandles', () => {
    it('should fetch candles with symbol and interval', async () => {
      const candles = [
        { timestamp: '10:00', open: 64200, high: 64500, low: 64100, close: 64450, volume: 1.2 },
      ];
      mockFetch.mockResolvedValue(mockResponse(candles));
      const result = await api.getCandles('BTCUSDT', '1h');
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/scraper/candles?symbol=BTCUSDT&interval=1h',
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    it('should throw ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: 'Not Found' }, 404));
      await expect(api.getServices()).rejects.toThrow(ApiError);
    });

    it('should include status code in error', async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: 'Forbidden' }, 403));
      try {
        await api.getServices();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(403);
      }
    });

    it('should fall back to statusText when JSON parsing fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });
      await expect(api.getServices()).rejects.toThrow('Internal Server Error');
    });

    it('should use Unknown error when response has no error field', async () => {
      mockFetch.mockResolvedValue(mockResponse({}, 400));
      await expect(api.getServices()).rejects.toThrow('Unknown error');
    });
  });

  describe('getConfig', () => {
    it('should fetch config without service filter', async () => {
      const config = [
        {
          key: 'DATABASE_URL',
          value: '****',
          masked: true,
          source: 'Vault',
          service: 'auth-service',
          updatedAt: '2024-05-20 14:30',
        },
      ];
      mockFetch.mockResolvedValue(mockResponse(config));
      const result = await api.getConfig();
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith('/v1/discovery/config', expect.any(Object));
    });

    it('should fetch config filtered by service', async () => {
      mockFetch.mockResolvedValue(mockResponse([]));
      await api.getConfig('auth-service');
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/discovery/config/auth-service',
        expect.any(Object)
      );
    });
  });

  describe('getCertificates', () => {
    it('should fetch certificate list', async () => {
      const certs = [
        {
          id: 'cert-1',
          commonName: 'api-gateway',
          fingerprint: 'abc123',
          expiresAt: '2025-01-01',
          status: 'valid',
          issuer: 'CA',
        },
      ];
      mockFetch.mockResolvedValue(mockResponse(certs));
      const result = await api.getCertificates();
      expect(result).toHaveLength(1);
    });
  });

  describe('revokeCertificate', () => {
    it('should send POST revoke request', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.revokeCertificate('cert-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/ca/revoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ certificateId: 'cert-1' }),
        })
      );
    });
  });

  describe('setAdminToken', () => {
    it('should update the token for subsequent requests', async () => {
      setAdminToken('new-token');
      mockFetch.mockResolvedValue(mockResponse({ services: [], topology: [] }));
      await api.getServices();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-api-key': 'new-token' }),
        })
      );
    });
  });

  describe('retryDlqMessage', () => {
    it('should send POST retry request', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.retryDlqMessage('msg-7721');
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/messages/dlq/msg-7721/retry',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('getTickers', () => {
    it('should fetch tickers by symbol', async () => {
      const ticker = {
        symbol: 'BTCUSDT',
        price: 64482.5,
        change24h: 1.24,
        high24h: 65120,
        low24h: 63800.4,
        volume24h: 1.42,
      };
      mockFetch.mockResolvedValue(mockResponse(ticker));
      const result = await api.getTickers('BTCUSDT');
      expect(result.symbol).toBe('BTCUSDT');
    });
  });

  describe('getOrderBook', () => {
    it('should fetch order book by symbol', async () => {
      const book = { bids: [['64000', '1.5']], asks: [['64500', '2.0']] };
      mockFetch.mockResolvedValue(mockResponse(book));
      const result = await api.getOrderBook('BTCUSDT');
      expect(result.bids).toHaveLength(1);
    });
  });

  describe('startTraining', () => {
    it('should send POST start request', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.startTraining();
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/trainer/start',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('stopTraining', () => {
    it('should send POST stop request', async () => {
      mockFetch.mockResolvedValue(mockResponse(null));
      await api.stopTraining();
      expect(mockFetch).toHaveBeenCalledWith(
        '/v1/trainer/stop',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('getStats', () => {
    it('should fetch stats summary', async () => {
      const stats = {
        activeServices: 24,
        totalServices: 26,
        totalInstances: 142,
        errorsRate: 0.04,
        avgLatency: 42,
      };
      mockFetch.mockResolvedValue(mockResponse(stats));
      const result = await api.getStats();
      expect(result.avgLatency).toBe(42);
    });
  });
});
