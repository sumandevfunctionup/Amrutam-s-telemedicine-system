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

// HTTP request logging
if (NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Request parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Root welcome route
app.get('/', (req, res) => {
  res.json({
    name: "Amrutam Telemedicine System API",
    status: 'online',
    version: '1.0.0',
    documentation: '/api-docs',
    health: '/api/v1/health',
    dbTest: '/api/v1/db-test',
  });
});

// Mount API router
app.use('/api/v1', router);

// Catch 404 routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`Amrutam Telemedicine Server is running`);
  console.log(`Base URL: http://localhost:${PORT}`);
  console.log(`API Docs: http://localhost:${PORT}/api-docs`);
  console.log(`Health:   http://localhost:${PORT}/api/v1/health`);
  console.log(`DB Test:  http://localhost:${PORT}/api/v1/db-test`);
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
