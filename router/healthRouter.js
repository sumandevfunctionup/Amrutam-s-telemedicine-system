import { Router } from 'express';
import { getHealth, testDbConnection } from '../controller/healthController.js';

const router = Router();

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     summary: System health check
 *     description: Returns the health status of the application server and connected PostgreSQL database.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: System is healthy
 *       503:
 *         description: System is unhealthy
 */
router.get('/health', getHealth);

/**
 * @openapi
 * /api/v1/db-test:
 *   get:
 *     summary: PostgreSQL database connection test
 *     description: Tests the live connection to PostgreSQL and returns database version, timestamp, and database name.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Database is connected and healthy
 *       500:
 *         description: Database connection failed
 */
router.get('/db-test', testDbConnection);

export default router;
