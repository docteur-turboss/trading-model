/* global __ENV */
import { ROUTES, get } from '../lib/public-api.js';

// Soak: constant moderate load through the edge-proxy for SOAK_DURATION (default 4h).
// Looks for drift (leaks, backlog, slowing), not for the ceiling.
//   SOAK_DURATION  total run, e.g. 5m, 4h (default 4h)
//   SOAK_VUS       VUs (default 2: at most 240 req/min: sleep(0.5) per request, not measured)
// The run is three consecutive phases at the same rate: "start" and "end" are the first and
// last 10 % (k6 cannot compare two periods, so each phase is tagged and gets its own
// threshold); "main" is the rest. Compare start/end p95 in the summary to read the drift.
// Needs RATE_LIMIT_MAX above the rate (tests/load/README.md, "Soak").
const total = toSeconds(__ENV.SOAK_DURATION || '4h');
const vus = Number(__ENV.SOAK_VUS || 2);
const edge = Math.max(1, Math.floor(total / 10));

const phase = (name, startTime, duration) => ({
  executor: 'constant-vus',
  vus,
  startTime: `${startTime}s`,
  duration: `${duration}s`,
  exec: 'run',
  tags: { phase: name },
});

export const options = {
  scenarios: {
    start: phase('start', 0, edge),
    main: phase('main', edge, total - 2 * edge),
    end: phase('end', total - edge, edge),
  },
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_failed{phase:start}': ['rate<0.01'],
    'http_req_failed{phase:end}': ['rate<0.01'],
    'http_req_duration{phase:start}': ['p(95)<2000'],
    'http_req_duration{phase:end}': ['p(95)<2000'],
  },
};

/** "90s", "5m", "4h" to seconds. */
function toSeconds(d) {
  const m = /^(\d+)([smh])$/.exec(d);
  if (!m) throw new Error(`bad SOAK_DURATION "${d}", use e.g. 90s, 5m, 4h`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]];
}

export function run() {
  ROUTES.forEach(get);
}
