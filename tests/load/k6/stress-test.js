/* global __ENV */
import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.05'],
  },
};

const GATEWAY_URL = __ENV.GATEWAY_URL || 'https://localhost:8443';

export default function () {
  group('gateway routing', () => {
    const endpoints = [
      `${GATEWAY_URL}/v1/discovery-server/health`,
      `${GATEWAY_URL}/v1/discovery-server/services`,
      `${GATEWAY_URL}/v1/trader-trainer/training-status`,
      `${GATEWAY_URL}/v1/audit-logger/events`,
    ];

    for (const url of endpoints) {
      const res = http.get(url, { tls: { insecureSkipTLSVerify: true } });
      check(res, {
        [`${url} status < 500`]: r => r.status < 500,
      });
    }
  });

  group('discovery operations', () => {
    const res = http.get(`${GATEWAY_URL}/services`, {
      tls: { insecureSkipTLSVerify: true },
    });
    check(res, {
      'registry response status < 500': r => r.status < 500,
    });
  });

  sleep(0.5);
}

// Run:  k6 run tests/load/k6/stress-test.js
//       k6 run --vus 200 --duration 5m tests/load/k6/stress-test.js
