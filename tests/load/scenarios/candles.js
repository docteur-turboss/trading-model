import { ROUTES, SLO_THRESHOLDS, get } from '../lib/public-api.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 0 },
  ],
  thresholds: SLO_THRESHOLDS,
};

export default () => get(ROUTES[0]);
