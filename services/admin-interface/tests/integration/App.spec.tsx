import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../../src/app';

const emptyDataMap: Record<string, unknown> = {
  services: { services: [], topology: [] },
  config: [],
  jobs: { jobs: [], stats: { pending: 0, inProgress: 0, failed: 0 } },
  workers: {
    workers: [],
    stats: { activeWorkers: 0, totalWorkers: 0, avgCpu: 0, totalJobsPerMin: 0, clusterMemory: 0 },
  },
  cache: { entries: [], stats: { hitRate: 0, activeEntries: 0 } },
  dlq: { messages: [], stats: { pending: 0, retryRate: 0, totalSize: 0, lastIncident: '-' } },
  candles: [],
  training: { results: [], total: 0 },
  certificates: [],
  audit: { events: [], total: 0, page: 0, limit: 5, volumeByTopic: [] },
  stats: { activeServices: 0, totalServices: 0, totalInstances: 0, errorsRate: 0, avgLatency: 0 },
};

beforeAll(() => {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    let data: unknown = {};
    if (url.includes('/discovery/registry')) data = emptyDataMap.services;
    else if (url.includes('/discovery/config')) data = emptyDataMap.config;
    else if (url.includes('/discovery/stats')) data = emptyDataMap.stats;
    else if (url.includes('/jobs/workers')) data = emptyDataMap.workers;
    else if (url.includes('/jobs')) data = emptyDataMap.jobs;
    else if (url.includes('/gateway/cache')) data = emptyDataMap.cache;
    else if (url.includes('/messages/dlq')) data = emptyDataMap.dlq;
    else if (url.includes('/scraper/candles')) data = emptyDataMap.candles;
    else if (url.includes('/trainer/results')) data = emptyDataMap.training;
    else if (url.includes('/ca/certificates')) data = emptyDataMap.certificates;
    else if (url.includes('/audit/events')) data = emptyDataMap.audit;

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    });
  });
});

describe('App Integration', () => {
  it('should render the sidebar on all pages', () => {
    render(<App />);
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('should render the footer', () => {
    render(<App />);
    expect(screen.getByText(/SYSTEM VERSION/)).toBeInTheDocument();
    expect(screen.getByText(/K8S CLUSTER/)).toBeInTheDocument();
  });

  it('should navigate to Services by default', async () => {
    render(<App />);
    expect(await screen.findByText('Services Registry')).toBeInTheDocument();
  });

  it('should navigate to Config page when sidebar link is clicked', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Config'));
    expect(await screen.findByText('Configuration Variables')).toBeInTheDocument();
  });

  it('should navigate to Audit Events page', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Audit Events'));
    expect(await screen.findByText('Audit Events')).toBeInTheDocument();
  });

  it('should navigate to Jobs page', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Jobs'));
    expect(await screen.findByText('Job Management')).toBeInTheDocument();
  });

  it('should navigate to Workers page', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Workers'));
    expect(await screen.findByText('Workers')).toBeInTheDocument();
  });

  it('should navigate to Market Data page', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Market Data'));
    expect(await screen.findByText('Market Data')).toBeInTheDocument();
  });

  it('should navigate to Certificates page', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Certificates'));
    expect(await screen.findByText('Certificates')).toBeInTheDocument();
  });

  it('should navigate to Training page', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Training'));
    expect(await screen.findByText('Training Results')).toBeInTheDocument();
  });

  it('should navigate to API Cache page', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('API Cache'));
    expect(await screen.findByText('API Gateway Cache')).toBeInTheDocument();
  });

  it('should navigate to Broker DLQ page', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Broker DLQ'));
    expect(screen.getByText('Broker DLQ')).toBeInTheDocument();
  });

  it('should show search resources input in sidebar', () => {
    render(<App />);
    expect(screen.getByPlaceholderText('Search resources...')).toBeInTheDocument();
  });

  it('should show PRODUCTION badge in sidebar', () => {
    render(<App />);
    expect(screen.getByText('PRODUCTION')).toBeInTheDocument();
  });

  it('should show notification bell badge', () => {
    render(<App />);
    const badges = screen.getAllByText('3');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
