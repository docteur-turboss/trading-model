/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_GATEWAY_URL || 'https://localhost:8448';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || 'dev-admin-token';

export default function () {
  const res = http.get(`${BASE_URL}/ping`, {
    headers: { 'x-api-key': ADMIN_TOKEN },
  });

  check(res, {
    'status is 200': r => r.status === 200,
    'response has status ok': r => r.json('status') === 'ok',
  });

  sleep(1);
}
