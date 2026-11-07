import { ROUTES, get } from '../lib/public-api.js';

// Stress thresholds, deliberately looser than the SLO: they find the limit, not the SLO.
export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    checks: ['rate>0.95'],
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default () => ROUTES.forEach(get);
