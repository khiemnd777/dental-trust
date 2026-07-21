import http from 'k6/http';
import { check, sleep } from 'k6';

import {
  boundedDuration,
  boundedInteger,
  requiredInternalHealthToken,
  safeTarget,
} from './safe-target.js';

const target = safeTarget();
const internalHealthToken = requiredInternalHealthToken();
// Keep deep readiness below its 30/minute per-network defense-in-depth budget.
const vus = boundedInteger('VUS', 1, 2);
const duration = boundedDuration('DURATION', '30s');

export const options = {
  vus,
  duration,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const live = http.get(`${target}/api/v1/health/live`, {
    tags: { surface: 'health-live' },
    timeout: '2s',
  });
  check(live, { 'liveness is cheap and successful': (response) => response.status === 200 });

  const ready = http.get(`${target}/api/v1/health/ready`, {
    tags: { surface: 'health-ready' },
    timeout: '2s',
    headers: { 'x-internal-health-token': internalHealthToken },
  });
  check(ready, {
    'readiness is locally evaluated': (response) => response.status === 200,
  });
  sleep(5);
}
