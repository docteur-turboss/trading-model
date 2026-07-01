/* global __ENV, __VU, __ITER */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_GATEWAY_URL || 'https://localhost:8448';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || 'dev-admin-token';

export default function () {
  const payload = JSON.stringify({
    targetService: 'audit-logger-service',
    payload: {
      symbol: 'BTCUSDT',
      price: 50000.0 + Math.random() * 1000,
      volume: 1.0 + Math.random() * 10,
    },
    deliveryMode: 'at-most-once',
    metadata: {
      topic: 'market.trade.recent.fetch',
      eventType: 'market.trade.recent.fetch',
      schemaVersion: '1.0.0',
      publisher: {
        serviceName: 'k6-load-test',
        instanceId: `k6-${__VU}-${__ITER}`,
      },
      delivery: {
        mode: 'at-most-once',
        ttl: 60000,
      },
    },
  });

  const res = http.post(`${BASE_URL}/v1/broker/message`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ADMIN_TOKEN,
    },
  });

  check(res, {
    'publish accepted (204)': (r) => r.status === 204,
  });

  sleep(1);
}
