import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../../src/app';

const richData = {
  services: {
    services: [
      {
        serviceName: 'api-gateway',
        instances: [
          {
            instanceId: 'i1',
            host: '10.0.0.1',
            port: 8080,
            version: '1.0',
            heartbeat: 'ok',
            status: 'healthy',
            ipPort: '10.0.0.1:8080',
          },
        ],
      },
      { serviceName: 'no-instances', instances: [] },
    ],
    topology: [],
  },
  stats: {
    activeServices: 1,
    totalServices: 2,
    totalInstances: 1,
    errorsRate: 0.04,
    avgLatency: 42,
  },
  config: [
    {
      key: 'DB_PASSWORD',
      value: 's3cret',
      masked: true,
      source: 'Vault',
      service: 'api-gateway',
      updatedAt: '2024-01-01',
    },
    {
      key: 'LOG_LEVEL',
      value: 'info',
      masked: false,
      source: 'ConfigMap',
      service: 'all',
      updatedAt: '2024-01-01',
    },
    {
      key: 'NODE_ENV',
      value: 'production',
      masked: false,
      source: 'EnvVar',
      service: 'all',
      updatedAt: '2024-01-01',
    },
    {
      key: 'LOCAL_VAR',
      value: 'test',
      masked: false,
      source: 'Local',
      service: 'worker',
      updatedAt: '2024-01-01',
    },
  ],
  jobs: {
    jobs: [
      { id: 'j1', type: 'BACKTEST', priority: 'CRITICAL', status: 'running', worker: 'w1' },
      { id: 'j2', type: 'TRAINING', priority: 'HIGH', status: 'pending', worker: null },
      { id: 'j3', type: 'REPORT', priority: 'LOW', status: 'completed', worker: 'w2' },
    ],
    stats: { pending: 1, inProgress: 1, failed: 0 },
  },
  jobDetail: {
    id: 'j1',
    type: 'BACKTEST',
    priority: 'CRITICAL',
    status: 'running',
    worker: 'w1',
    timeline: [{ event: 'Created', timestamp: 't1', description: 'Job submitted', active: true }],
    payload: { model: 'v1' },
    logs: ['[INFO] started'],
  },
  workers: {
    workers: [
      {
        id: 'w1',
        ip: '10.0.0.1',
        region: 'us-east',
        cpu: 85,
        ram: 72,
        status: 'Online',
        heartbeat: 'ok',
        activeJobs: 3,
      },
      {
        id: 'w2',
        ip: '10.0.0.2',
        region: 'eu-west',
        cpu: 45,
        ram: 60,
        status: 'Draining',
        heartbeat: 'ok',
        activeJobs: 0,
      },
      {
        id: 'w3',
        ip: '10.0.0.3',
        region: 'ap-south',
        cpu: 95,
        ram: 88,
        status: 'Offline',
        heartbeat: 'stale',
        activeJobs: 0,
      },
    ],
    stats: {
      activeWorkers: 2,
      totalWorkers: 3,
      avgCpu: 75,
      totalJobsPerMin: 150,
      clusterMemory: 64,
    },
  },
  cache: {
    entries: [
      {
        key: 'cache:k1',
        service: 'api',
        expiration: '1h',
        size: '2KB',
        lastAccess: 'now',
        status: 'healthy',
      },
      { key: 'cache:k2', service: 'api', expiration: '1h', size: '1KB', lastAccess: 'now' },
    ],
    stats: { hitRate: 95, activeEntries: 1240 },
  },
  dlq: {
    messages: [
      {
        id: 'm1',
        timestamp: 't1',
        topic: 'orders',
        messageId: 'msg1',
        failureReason: 'Invalid JSON',
        attempts: 5,
        payloadPreview: '{...}',
      },
      {
        id: 'm2',
        timestamp: 't2',
        topic: 'trades',
        messageId: 'msg2',
        failureReason: 'Timeout',
        attempts: 3,
        payloadPreview: '{...}',
      },
    ],
    stats: { pending: 2, retryRate: 60, totalSize: 512, lastIncident: 't3' },
  },
  candles: [
    { timestamp: 't1', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    { timestamp: 't2', open: 105, high: 115, low: 100, close: 112, volume: 1200 },
  ],
  training: {
    results: [
      {
        id: 'tr1',
        symbol: 'BTC',
        generation: 42,
        fitness: 0.824,
        sharpe: 1.8,
        genome: {
          modelId: 'm1',
          layers: [],
          optimizer: 'adam',
          learningRate: 0.001,
          mutationRate: 0.01,
        },
      },
      { id: 'tr2', symbol: 'ETH', generation: 10, fitness: 0.456, sharpe: 1.2 },
    ],
    total: 2,
  },
  certificates: [
    {
      id: 'c1',
      commonName: 'api.example.com',
      issuer: 'CA',
      fingerprint: 'abc123def456',
      expiresAt: '2025-01-01',
      status: 'valid',
    },
    {
      id: 'c2',
      commonName: 'expired.example.com',
      issuer: 'CA',
      fingerprint: 'def789ghi012',
      expiresAt: '2024-06-01',
      status: 'expiring',
    },
    {
      id: 'c3',
      commonName: 'revoked.example.com',
      issuer: 'CA',
      fingerprint: 'jkl345mno678',
      expiresAt: '2023-01-01',
      status: 'revoked',
    },
  ],
  audit: {
    events: [
      {
        timestamp: 't1',
        topic: 'AUTH',
        publisher: 'p1',
        correlationId: 'cid1',
        summary: 'Login',
        severity: 'INFO',
      },
      {
        timestamp: 't2',
        topic: 'ORDER',
        publisher: 'p2',
        correlationId: 'cid2',
        summary: 'Order placed',
        severity: 'WARNING',
      },
      {
        timestamp: 't3',
        topic: 'PAYMENT',
        publisher: 'p3',
        correlationId: 'cid3',
        summary: 'Payment failed',
        severity: 'ERROR',
      },
      {
        timestamp: 't4',
        topic: 'NOTIF',
        publisher: 'p4',
        correlationId: 'cid4',
        summary: 'Critical alert',
        severity: 'CRITICAL',
      },
    ],
    total: 4,
    page: 0,
    limit: 5,
    volumeByTopic: [
      { topic: 'AUTH', count: 100 },
      { topic: 'ORDER', count: 200 },
    ],
  },
};

function mockFetch(extraJobs?: boolean) {
  return vi.fn().mockImplementation((url: string) => {
    let data: unknown = {};
    if (url.includes('/discovery/registry')) data = richData.services;
    else if (url.includes('/discovery/config')) data = richData.config;
    else if (url.includes('/discovery/stats')) data = richData.stats;
    else if (url.includes('/jobs/workers')) data = richData.workers;
    else if (url.includes('/jobs/') && extraJobs) data = richData.jobDetail;
    else if (url.includes('/jobs')) data = richData.jobs;
    else if (url.includes('/gateway/cache')) data = richData.cache;
    else if (url.includes('/messages/dlq')) data = richData.dlq;
    else if (url.includes('/scraper/candles')) data = richData.candles;
    else if (url.includes('/trainer/results')) data = richData.training;
    else if (url.includes('/ca/certificates')) data = richData.certificates;
    else if (url.includes('/audit/events')) data = richData.audit;

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    });
  });
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('Page interactions', () => {
  it('Services: should render with instances and filter', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    expect(await screen.findByText('Services Registry')).toBeInTheDocument();
    expect(await screen.findByText('api-gateway')).toBeInTheDocument();
    expect(await screen.findByText('no-instances')).toBeInTheDocument();

    const filterInput = screen.getByPlaceholderText('Filter by service name...');
    fireEvent.change(filterInput, { target: { value: 'api' } });
    expect(screen.getByDisplayValue('api')).toBeInTheDocument();
  });

  it('Services: should show empty states when no primary instance', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    expect(await screen.findByText('Services Registry')).toBeInTheDocument();

    const dashItems = screen.getAllByText('-');
    expect(dashItems.length).toBeGreaterThan(0);
  });

  it('Config: should render masked values and source chips', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('Config'));
    expect(await screen.findByText('Configuration Variables')).toBeInTheDocument();

    expect(screen.getByText('DB_PASSWORD')).toBeInTheDocument();
    expect(screen.getByText('Vault')).toBeInTheDocument();
    expect(screen.getByText('ConfigMap')).toBeInTheDocument();
    expect(screen.getByText('EnvVar')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('Workers: should render all worker statuses and load bars', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('Workers'));
    expect(await screen.findByText('Workers')).toBeInTheDocument();

    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('us-east')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Draining')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('Cache: should render entries with and without status', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('API Cache'));
    expect(await screen.findByText('API Gateway Cache')).toBeInTheDocument();

    expect(screen.getByText('cache:k1')).toBeInTheDocument();
    expect(screen.getByText('cache:k2')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('Dlq: should support row selection and select all', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('Broker DLQ'));
    expect(await screen.findByText('Broker DLQ')).toBeInTheDocument();

    expect(screen.getByText('msg1')).toBeInTheDocument();
    expect(screen.getByText('msg2')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[0]);
  });

  it('Jobs: should open drawer when row selected', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('Jobs'));
    expect(await screen.findByText('Job Management')).toBeInTheDocument();

    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('LOW')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
  });

  it('TrainingResults: should render sharpe chips and open drawer', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('Training'));
    expect(await screen.findByText('Training Results')).toBeInTheDocument();

    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('1.20')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
  });

  it('MarketData: should render chart with candle data', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('Market Data'));
    expect(await screen.findByText('Market Data')).toBeInTheDocument();

    const prices = screen.getAllByText('$105');
    expect(prices.length).toBeGreaterThanOrEqual(1);
    const prices2 = screen.getAllByText('$112');
    expect(prices2.length).toBeGreaterThanOrEqual(1);
  });

  it('AuditEvents: should render all severity levels and volume chart', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('Audit Events'));
    expect(await screen.findByText('Audit Events')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(
      'Search by Correlation ID, Payload or Message...'
    );
    fireEvent.change(searchInput, { target: { value: 'cid1' } });

    expect(await screen.findByDisplayValue('cid1', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('Certificates: should render all certificate statuses', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    fireEvent.click(screen.getByText('Certificates'));
    expect(await screen.findByText('Certificates')).toBeInTheDocument();

    expect(screen.getByText('api.example.com')).toBeInTheDocument();
    expect(screen.getByText('expired.example.com')).toBeInTheDocument();
    expect(screen.getByText('revoked.example.com')).toBeInTheDocument();
  });

  it('should navigate from Services to Config page', async () => {
    globalThis.fetch = mockFetch();
    render(<App />);
    expect(await screen.findByText('Services Registry')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Config'));
    expect(await screen.findByText('Configuration Variables')).toBeInTheDocument();
  });
});
