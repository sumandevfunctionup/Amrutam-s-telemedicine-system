import { Router } from 'express';
import {
  listAuditLogs,
  getAuditLogSummary,
  getAuditLogById,
} from '../controller/auditController.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { validate } from '../helper/validator.js';
import { listAuditLogsQuerySchema, auditLogIdParamSchema } from '../helper/schemas.js';

const router = Router();

// Apply strict Admin RBAC protection to all audit routes
router.use(authenticate, authorize('admin'));

/**
 * @openapi
 * /api/v1/admin/audit-logs:
 *   get:
 *     summary: Browse and filter non-repudiation audit trails (Admin only)
 *     description: Retrieve audit logs with multi-dimensional filtering by action, entity_type, user_id, and UTC date ranges.
 *     tags:
 *       - Compliance & Audit Trails
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Action name (e.g. BOOKING_CONFIRMED, SLOT_LOCKED, PAYMENT_COMPLETED)
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: string
 *         description: Entity type (consultations, availability_slots, payments, prescriptions, doctors, users)
 *       - in: query
 *         name: entity_id
 *         schema:
 *           type: string
 *         description: Specific entity ID or UUID
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter events by actor UUID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date in YYYY-MM-DD format (UTC)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date in YYYY-MM-DD format (UTC)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *       401:
 *         description: Unauthorized (Token missing or invalid)
 *       403:
 *         description: Forbidden (Non-admin access attempt)
 */
router.get('/', validate(listAuditLogsQuerySchema), listAuditLogs);

/**
 * @openapi
 * /api/v1/admin/audit-logs/summary:
 *   get:
 *     summary: Compliance metrics & security telemetry summary (Admin only)
 *     description: Aggregated audit counts, action distributions, 24-hour activity volume, and top active actors.
 *     tags:
 *       - Compliance & Audit Trails
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit summary metrics retrieved successfully
 *       403:
 *         description: Forbidden (Non-admin access)
 */
router.get('/summary', getAuditLogSummary);

/**
 * @openapi
 * /api/v1/admin/audit-logs/{id}:
 *   get:
 *     summary: Fetch single audit log entry by UUID (Admin only)
 *     description: Retrieve detailed non-repudiation record including full JSONB diff details, IP, User-Agent, and actor context.
 *     tags:
 *       - Compliance & Audit Trails
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Audit log entry UUID
 *     responses:
 *       200:
 *         description: Audit log entry details
 *       404:
 *         description: Audit log entry not found
 *       403:
 *         description: Forbidden (Non-admin access)
 */
router.get('/:id', validate(auditLogIdParamSchema), getAuditLogById);

export default router;
