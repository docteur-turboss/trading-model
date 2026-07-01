import https from 'https';

interface HealthResult {
  service: string;
  url: string;
  status: number;
  ok: boolean;
  error?: string;
}

const SERVICES = [
  { name: 'discovery-server', url: 'https://localhost:8443/ping' },
  { name: 'message-manager', url: 'https://localhost:8444/health/ready' },
  { name: 'financial-scraper', url: 'https://localhost:8445/health' },
  { name: 'trader-trainer', url: 'https://localhost:8446/ping' },
  { name: 'certificate-authority', url: 'https://localhost:8447/ping' },
  { name: 'api-gateway', url: 'https://localhost:8448/ping' },
  { name: 'admin-interface', url: 'http://localhost:8449/ping' },
  { name: 'audit-logger', url: 'https://localhost:8450/ping' },
  { name: 'dlq-service', url: 'https://localhost:8452/health' },
];

function fetchUrl(url: string, timeout = 10000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : require('http');

    const req = lib.get(
      url,
      {
        rejectUnauthorized: false,
        timeout,
      },
      (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );

    req.on('error', (err: Error) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });
  });
}

async function checkServiceHealth(service: { name: string; url: string }): Promise<HealthResult> {
  try {
    const { status } = await fetchUrl(service.url);
    const ok = status >= 200 && status < 500;
    return { service: service.name, url: service.url, status, ok };
  } catch (err) {
    return {
      service: service.name,
      url: service.url,
      status: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

describe('Production Smoke Tests', () => {
  jest.setTimeout(60000);

  test('all services respond to health checks', async () => {
    const results = await Promise.all(SERVICES.map(checkServiceHealth));
    const failed = results.filter(r => !r.ok);

    console.log('\nService Health Results:');
    for (const r of results) {
      const icon = r.ok ? '✓' : '✗';
      console.log(`  ${icon} ${r.service.padEnd(25)} ${r.status || 'ERR'}  ${r.error || ''}`);
    }

    if (failed.length > 0) {
      console.error(`\n${failed.length}/${SERVICES.length} services unhealthy`);
      for (const f of failed) {
        console.error(`  ✗ ${f.service} (${f.url}): ${f.error || `status ${f.status}`}`);
      }
    }

    expect(failed.length).toBe(0);
  }, 60000);

  test('discovery-server lists registered services', async () => {
    const { status, body } = await fetchUrl('https://localhost:8443/services');
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(typeof parsed).toBe('object');
    console.log(`  Discovery registry contains ${Object.keys(parsed).length} service types`);
  });

  test('message-manager accepts new messages', async () => {
    const { status } = await fetchUrl('https://localhost:8444/health/ready');
    expect(status).toBe(200);
  });
});
