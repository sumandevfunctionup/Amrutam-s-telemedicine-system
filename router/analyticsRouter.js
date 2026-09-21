import { Router } from 'express';
import {
  getOverviewKpis,
  getConsultationTimeseries,
  getRevenuePerformance,
  getDoctorUtilization,
} from '../controller/analyticsController.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { validate } from '../helper/validator.js';
import { analyticsDateRangeSchema } from '../helper/schemas.js';

const router = Router();

// Strict Admin RBAC gatekeeper
router.use(authenticate, authorize('admin'));

/**
 * @openapi
 * /api/v1/admin/analytics/overview:
 *   get:
 *     summary: Executive KPI Overview Dashboard (Admin only)
 *     description: High-level platform KPIs including daily consultation volume progress towards the 100k daily capacity goal, active user counts, and gross/net revenue. Cached in Redis.
 *     tags:
 *       - Admin Analytics & Intelligence
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Executive dashboard KPIs
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 */
router.get('/overview', getOverviewKpis);

/**
 * @openapi
 * /api/v1/admin/analytics/consultations:
 *   get:
 *     summary: Consultation Volume Timeseries Breakdown (Admin only)
 *     description: Historical trend analysis of consultations grouped by day, week, or month with status distribution.
 *     tags:
 *       - Admin Analytics & Intelligence
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Time bucket grouping
 *     responses:
 *       200:
 *         description: Timeseries data
 *       403:
 *         description: Forbidden
 */
router.get('/consultations', validate(analyticsDateRangeSchema), getConsultationTimeseries);

/**
 * @openapi
 * /api/v1/admin/analytics/revenue:
 *   get:
 *     summary: Financial & Revenue Performance Intelligence (Admin only)
 *     description: Financial performance metrics grouped by Ayurvedic clinical specialization and payment method.
 *     tags:
 *       - Admin Analytics & Intelligence
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Revenue performance metrics
 *       403:
 *         description: Forbidden
 */
router.get('/revenue', validate(analyticsDateRangeSchema), getRevenuePerformance);

/**
 * @openapi
 * /api/v1/admin/analytics/doctors:
 *   get:
 *     summary: Doctor Utilization & Capacity Intelligence (Admin only)
 *     description: Platform calendar slot utilization percentages and rankings of top Ayurvedic physicians by completed consultations.
 *     tags:
 *       - Admin Analytics & Intelligence
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Doctor utilization and performance rankings
 *       403:
 *         description: Forbidden
 */
router.get('/doctors', getDoctorUtilization);

export default router;
