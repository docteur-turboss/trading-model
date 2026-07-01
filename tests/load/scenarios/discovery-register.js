import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

const DISCOVERY_URL = __ENV.DISCOVERY_SERVER_URL || 'https://localhost:8443';

export default function () {
  const registerRes = http.post(
    `${DISCOVERY_URL}/api/services/register`,
    JSON.stringify({
      name: `k6-test-service-${__VU}`,
      version: '1.0.0',
      host: '10.0.0.99',
      port: 9999,
      healthEndpoint: '/ping',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  check(registerRes, {
    'register accepted (201)': (r) => r.status === 201,
  });

  sleep(2);
}
