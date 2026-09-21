import { checkDbConnection } from '../db/db.js';
import { pingRedis } from '../helper/redis.js';
import { successResponse, errorResponse } from '../helper/apiResponse.js';
import { getCurrentUtcDateTime } from '../helper/date.js';

/**
 * Controller to check server, database, and Redis health
 */
export async function getHealth(req, res) {
  try {
    const [dbStatus, redisStatus] = await Promise.all([
      checkDbConnection(),
      pingRedis(),
    ]);

    const isSystemHealthy =
      dbStatus.status === 'healthy' &&
      (redisStatus.status === 'healthy' || redisStatus.status === 'disabled');

    const healthData = {
      status: isSystemHealthy ? 'UP' : 'DEGRADED',
      timestamp: getCurrentUtcDateTime(),
      uptime: Math.floor(process.uptime()),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };

    return successResponse(res, healthData, 'System is operating normally');
  } catch (error) {
    return errorResponse(res, 'Health check failed', 503, { details: error.message });
  }
}

/**
 * Controller to test PostgreSQL database connection
 */
export async function testDbConnection(req, res) {
  const dbStatus = await checkDbConnection();

  if (dbStatus.status === 'healthy') {
    return successResponse(
      res,
      dbStatus,
      'PostgreSQL database connected successfully',
      200
    );
  }

  return errorResponse(
    res,
    'PostgreSQL database connection failed',
    500,
    dbStatus
  );
}
