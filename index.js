import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { db } from './db/db.js';
import { swaggerSpec } from './helper/swagger.js';
import router from './router/indexRouter.js';
import { notFoundHandler, errorHandler } from './auth/middleware.js';
import { rateLimiter } from './auth/rateLimiter.js';
import { correlationMiddleware } from './helper/correlation.js';
import { metricsMiddleware, getMetrics } from './helper/metrics.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// Cross-origin resource sharing
app.use(cors());

// Request Correlation & Tracing
app.use(correlationMiddleware);

// Prometheus Metrics Middleware
app.use(metricsMiddleware);

// HTTP request logging with correlation ID
if (NODE_ENV !== 'test') {
  morgan.token('correlation-id', (req) => req.correlationId || '-');
  app.use(morgan('[:date[iso]] :method :url :status :response-time ms - [CorrID: :correlation-id]'));
}

// Request parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Prometheus Metrics Exporter
app.get('/metrics', getMetrics);

// Swagger documentation
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: `Amrutam API Docs v${swaggerSpec.info?.version}`,
    customCss: `
      .swagger-ui .info .title small.version-stamp,
      .swagger-ui .info .title small {
        background-color: #047857 !important;
        padding: 3px 10px !important;
        border-radius: 6px !important;
        color: #ffffff !important;
        font-weight: 700 !important;
        font-size: 14px !important;
        margin-left: 10px !important;
        display: inline-block !important;
      }
      .swagger-ui .info .title small pre.version {
        color: #ffffff !important;
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .swagger-ui .topbar { display: none }
    `,
  })
);
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Root welcome route
app.get('/', (req, res) => {
  res.json({
    name: "Amrutam Telemedicine System API",
    status: 'online',
    version: swaggerSpec.info?.version || '2.1.0',
    documentation: '/api-docs',
    health: '/api/v1/health',
    dbTest: '/api/v1/db-test',
    metrics: '/metrics',
  });
});

// Mount API router with global rate limiter (300 req / 60s per client)
app.use('/api/v1', rateLimiter({ max: 300, windowSeconds: 60, keyPrefix: 'api-global' }), router);

// Catch 404 routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, async () => {
  console.log(`=========================================`);
  console.log(`Amrutam Telemedicine Server is running`);
  console.log(`Base URL: http://localhost:${PORT}`);
  console.log(`API Docs: http://localhost:${PORT}/api-docs`);
  console.log(`Health:   http://localhost:${PORT}/api/v1/health`);
  console.log(`DB Test:  http://localhost:${PORT}/api/v1/db-test`);

  try {
    const { pingRedis } = await import('./helper/redis.js');
    const redisHealth = await pingRedis();
    console.log(`Redis:    ${redisHealth.status.toUpperCase()} (${redisHealth.latency_ms}ms, ${redisHealth.mode || 'upstash'})`);
  } catch (err) {
    console.warn(`Redis:    DISABLED (${err.message})`);
  }
  console.log(`=========================================`);
});

// Graceful shutdown handling
const shutdown = (signal) => {
  console.log(`\n[${signal}] Initiating graceful shutdown...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await db.destroy();
      console.log('Database pool connection destroyed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during database teardown:', err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
