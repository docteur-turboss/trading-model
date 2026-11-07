/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

// Real external entry: the edge-proxy (compose host port 8449), never a service port.
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8449';
// A key of GATEWAY_AUTH_TOKENS (E2E overlay: e2e-api-key). Unset or wrong => 401 => the run fails.
const API_KEY = __ENV.API_KEY || '';

// Public routes (PUBLIC_ROUTES), one per upstream: MySQL, Redis registry, MongoDB.
export const ROUTES = [
  '/v1/financial-scraper/candles/symbols/BTCUSDT',
  '/v1/discovery-server/services',
  '/v1/audit-logger/events',
];

// SLO (docs/operations/slo.md): P95 <= 2 s, errors < 1 %.
export const SLO_THRESHOLDS = {
  checks: ['rate>0.99'],
  http_req_duration: ['p(95)<2000'],
  http_req_failed: ['rate<0.01'],
};

/** GET `path` through the edge and require a 200. */
export function get(path) {
  const res = http.get(`${BASE_URL}${path}`, { headers: { 'x-api-key': API_KEY } });
  check(res, { [`GET ${path} is 200`]: r => r.status === 200 });
  sleep(0.5);
}
