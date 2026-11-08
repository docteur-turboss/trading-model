import { ROUTES, SLO_THRESHOLDS, get } from '../lib/public-api.js';

// CI smoke (E2E job): 2 VUs for 30 s over the three public routes, SLO thresholds.
export const options = { vus: 2, duration: '30s', thresholds: SLO_THRESHOLDS };

export default () => ROUTES.forEach(get);
