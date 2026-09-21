import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function runModule10Tests() {
  console.log('==================================================================');
  console.log('--- STARTING MODULE 10: OBSERVABILITY, DOCKER & CI/CD TESTS ---');
  console.log('==================================================================');

  // Step 1: Automated Correlation ID Generation
  console.log('\n[Step 1] Verifying Ingress X-Correlation-ID Generation');
  const res1 = await fetch(`${BASE_URL}/api/v1/health`);
  const corrId1 = res1.headers.get('x-correlation-id');
  console.log('Generated X-Correlation-ID:', corrId1);
  if (!corrId1 || corrId1.length < 10) {
    throw new Error('Server failed to generate or attach X-Correlation-ID');
  }
  console.log('SUCCESS: Auto-generated correlation ID verified!');

  // Step 2: Custom Correlation ID Pass-Through
  console.log('\n[Step 2] Verifying Custom X-Correlation-ID Pass-Through');
  const customTraceId = 'amrutam-trace-test-uuid-999';
  const res2 = await fetch(`${BASE_URL}/api/v1/health`, {
    headers: { 'X-Correlation-ID': customTraceId },
  });
  const corrId2 = res2.headers.get('x-correlation-id');
  console.log('Echoed X-Correlation-ID:', corrId2);
  if (corrId2 !== customTraceId) {
    throw new Error(`Expected correlation ID "${customTraceId}", got "${corrId2}"`);
  }
  console.log('SUCCESS: Custom correlation ID pass-through verified!');

  // Step 3: Prometheus Metrics Scraping Endpoint
  console.log('\n[Step 3] Verifying Prometheus Metrics Scraping Endpoint (GET /metrics)');
  const resMetrics = await fetch(`${BASE_URL}/metrics`);
  const metricsContentType = resMetrics.headers.get('content-type');
  const metricsBody = await resMetrics.text();
  console.log('Metrics Status Code:', resMetrics.status);
  console.log('Metrics Content-Type:', metricsContentType);

  if (!metricsContentType.includes('text/plain')) {
    throw new Error(`Expected text/plain content-type, got "${metricsContentType}"`);
  }

  // Check for expected Prometheus metrics
  const requiredMetrics = [
    'amrutam_process_cpu_user_seconds_total',
    'amrutam_process_resident_memory_bytes',
    'amrutam_http_request_duration_seconds',
    'amrutam_http_requests_total',
  ];

  for (const metric of requiredMetrics) {
    if (!metricsBody.includes(metric)) {
      throw new Error(`Prometheus output is missing required metric: ${metric}`);
    }
    console.log(`- Metric found: ${metric}`);
  }
  console.log('SUCCESS: Standard Prometheus scraping output verified!');

  // Step 4: Docker Artifacts Verification
  console.log('\n[Step 4] Verifying Dockerfile and docker-compose.yml');
  const dockerfilePath = path.resolve('Dockerfile');
  const dockerIgnorePath = path.resolve('.dockerignore');
  const dockerComposePath = path.resolve('docker-compose.yml');

  if (!fs.existsSync(dockerfilePath)) throw new Error('Dockerfile does not exist');
  if (!fs.existsSync(dockerIgnorePath)) throw new Error('.dockerignore does not exist');
  if (!fs.existsSync(dockerComposePath)) throw new Error('docker-compose.yml does not exist');

  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
  if (!dockerfileContent.includes('HEALTHCHECK') || !dockerfileContent.includes('USER node')) {
    throw new Error('Dockerfile missing security best practices (USER node, HEALTHCHECK)');
  }
  console.log('SUCCESS: Docker multi-stage build manifest & healthcheck verified!');

  // Step 5: GitHub Actions CI/CD Pipeline Verification
  console.log('\n[Step 5] Verifying GitHub Actions CI/CD Workflow');
  const ciPath = path.resolve('.github/workflows/ci.yml');
  if (!fs.existsSync(ciPath)) throw new Error('.github/workflows/ci.yml does not exist');
  const ciContent = fs.readFileSync(ciPath, 'utf8');
  if (!ciContent.includes('actions/checkout') || !ciContent.includes('matrix')) {
    throw new Error('CI workflow missing standard matrix testing or checkout');
  }
  console.log('SUCCESS: GitHub Actions CI workflow verified!');

  console.log('\n==================================================================');
  console.log('--- ALL MODULE 10 OBSERVABILITY & INFRASTRUCTURE TESTS PASSED! ---');
  console.log('==================================================================');
}

runModule10Tests().catch((err) => {
  console.error('Module 10 test suite failed:', err);
  process.exit(1);
});
