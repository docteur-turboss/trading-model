/* global __ENV */
import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const GATEWAY_URL = __ENV.GATEWAY_URL || 'https://localhost:8443';

export default function () {
  group('health checks', () => {
    const endpoints = [
      `${GATEWAY_URL}/ping`,
      `${GATEWAY_URL}/v1/discovery-server/health`,
      `${GATEWAY_URL}/v1/message-manager/health/ready`,
      `${GATEWAY_URL}/v1/discovery/services`,
    ];

    for (const url of endpoints) {
      const res = http.get(url, { tls: { insecureSkipTLSVerify: true } });
      check(res, {
        [`${url} returns 200`]: r => r.status === 200,
      });
    }
  });

  group('discovery registry', () => {
    const res = http.get(`${GATEWAY_URL}/services`, {
      tls: { insecureSkipTLSVerify: true },
    });
    check(res, {
      'services endpoint returns 200': r => r.status === 200,
      'services returns JSON': r => r.headers['Content-Type'] === 'application/json',
    });
  });

  sleep(1);
}

// Run:  k6 run tests/load/k6/smoke-test.js
//       k6 run --env GATEWAY_URL=https://gateway.example.com tests/load/k6/smoke-test.js
