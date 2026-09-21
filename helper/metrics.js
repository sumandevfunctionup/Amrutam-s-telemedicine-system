import client from 'prom-client';

// Initialize Prometheus Register
const register = new client.Registry();

// Enable collection of default Node.js runtime metrics (CPU, Memory, Event Loop Lag, GC)
client.collectDefaultMetrics({
  register,
  prefix: 'amrutam_',
});

// Custom Metric: HTTP Request Duration Histogram
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'amrutam_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// Custom Metric: HTTP Requests Total Counter
export const httpRequestsTotal = new client.Counter({
  name: 'amrutam_http_requests_total',
  help: 'Total count of HTTP requests received',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Custom Metric: Active Consultation Sessions Gauge
export const activeConsultationsGauge = new client.Gauge({
  name: 'amrutam_active_consultations_total',
  help: 'Current count of in-progress telemedicine consultation rooms',
  registers: [register],
});

// Custom Metric: Redis Cache Operations Counter
export const redisOperationsTotal = new client.Counter({
  name: 'amrutam_redis_operations_total',
  help: 'Total count of Redis operations (hits, misses, locks, revocations)',
  labelNames: ['operation', 'result'],
  registers: [register],
});

/**
 * Express middleware to observe HTTP request durations and status codes
 */
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime();

  res.on('finish', () => {
    // Exclude Prometheus scraping endpoint itself from polluting metrics
    if (req.path === '/metrics') return;

    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;

    // Normalize route to avoid high-cardinality labels from path parameters
    const route = req.baseUrl ? `${req.baseUrl}${req.route?.path || req.path}` : req.route?.path || req.path || 'unknown';
    const statusCode = res.statusCode ? String(res.statusCode) : 'unknown';

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      durationInSeconds
    );

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });
  });

  next();
}

/**
 * Endpoint handler to serve Prometheus metrics
 * GET /metrics
 */
export async function getMetrics(req, res) {
  try {
    res.setHeader('Content-Type', register.contentType);
    const metricsData = await register.metrics();
    res.send(metricsData);
  } catch (err) {
    res.status(500).send(`Error collecting metrics: ${err.message}`);
  }
}

export { register };
