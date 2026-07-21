import http from 'k6/http';
import { check, sleep } from 'k6';

import { boundedDuration, boundedInteger, safeGetPaths, safeTarget } from './safe-target.js';

const target = safeTarget();
const paths = safeGetPaths();
const vus = boundedInteger('VUS', 10, 50);
const duration = boundedDuration('DURATION', '60s');

export const options = {
  scenarios: {
    bounded_public_burst: {
      executor: 'constant-vus',
      vus,
      duration,
      gracefulStop: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  for (const path of paths) {
    const response = http.get(`${target}${path}`, {
      tags: { surface: 'public-read' },
      timeout: '3s',
      redirects: 0,
    });
    check(response, {
      'request is served or deliberately rejected': (result) =>
        result.status < 500 || result.status === 429,
    });
  }
  sleep(0.25);
}
