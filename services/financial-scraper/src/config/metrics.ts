import { Request, Response } from 'express';
import promClient from 'prom-client';

promClient.collectDefaultMetrics({ prefix: 'scraper_' });

export const tradesFetchedTotal = new promClient.Counter({
  name: 'scraper_trades_fetched_total',
  help: 'Total trades fetched from exchange',
  labelNames: ['source', 'symbol'] as const,
});

export const tradesPublishedTotal = new promClient.Counter({
  name: 'scraper_trades_published_total',
  help: 'Total trades published to message bus',
  labelNames: ['symbol'] as const,
});

export const apiErrorsTotal = new promClient.Counter({
  name: 'scraper_api_errors_total',
  help: 'Total exchange API errors',
  labelNames: ['source', 'error_type'] as const,
});

export const fetchDurationSeconds = new promClient.Histogram({
  name: 'scraper_fetch_duration_seconds',
  help: 'Exchange data fetch latency in seconds',
  labelNames: ['source', 'data_type'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

export const symbolsTracked = new promClient.Gauge({
  name: 'scraper_symbols_tracked',
  help: 'Number of symbols currently being tracked',
});

export const activeWorkers = new promClient.Gauge({
  name: 'scraper_active_workers',
  help: 'Number of active fetch workers',
});

export const dbWriteLatencySeconds = new promClient.Histogram({
  name: 'scraper_db_write_duration_seconds',
  help: 'Database write latency in seconds',
  labelNames: ['table'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
});

export function metricsHandler(_req: Request, res: Response): void {
  res.set('Content-Type', promClient.register.contentType);
  promClient.register.metrics().then(data => res.send(data));
}
