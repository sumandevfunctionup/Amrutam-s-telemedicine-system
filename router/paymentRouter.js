import { Router } from 'express';
import {
  initiatePayment,
  handlePaymentWebhook,
  processRefund,
  getPaymentById,
  getMyPayments,
} from '../controller/paymentController.js';
import { authenticate, authorize, idempotency } from '../auth/middleware.js';
import { validate } from '../helper/validator.js';
import {
  initiatePaymentSchema,
  paymentWebhookSchema,
  refundPaymentSchema,
  paymentIdParamSchema,
  listPaymentsQuerySchema,
} from '../helper/schemas.js';

const router = Router();

/**
 * @openapi
 * /api/v1/payments/initiate:
 *   post:
 *     summary: Initiate checkout order / payment intent for a consultation
 *     tags:
 *       - Payments & Saga Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consultation_id
 *             properties:
 *               consultation_id:
 *                 type: string
 *                 format: uuid
 *               payment_method:
 *                 type: string
 *                 enum: [upi, card, netbanking, wallet]
 *                 default: upi
 *     responses:
 *       201:
 *         description: Payment order created with transaction ID
 *       404:
 *         description: Consultation not found
 *       409:
 *         description: Consultation already paid
 */
router.post(
  '/initiate',
  authenticate,
  authorize('patient', 'admin'),
  idempotency,
  validate(initiatePaymentSchema),
  initiatePayment
);

/**
 * @openapi
 * /api/v1/payments/webhook:
 *   post:
 *     summary: Payment gateway webhook handler (Idempotent + Saga automated compensation)
 *     tags:
 *       - Payments & Saga Ledger
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event
 *               - transaction_id
 *             properties:
 *               event:
 *                 type: string
 *                 enum: [payment.success, payment.failed]
 *                 example: payment.success
 *               transaction_id:
 *                 type: string
 *                 example: ORDER-1726748493-29481
 *     responses:
 *       200:
 *         description: Webhook processed idempotently
 *       404:
 *         description: Payment transaction not found
 */
router.post(
  '/webhook',
  validate(paymentWebhookSchema),
  handlePaymentWebhook
);

/**
 * @openapi
 * /api/v1/payments/{id}/refund:
 *   post:
 *     summary: Process refund for a completed payment and release booked slot
 *     tags:
 *       - Payments & Saga Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Consultation cancelled by patient"
 *     responses:
 *       200:
 *         description: Payment refunded successfully and slot schedule restored
 *       403:
 *         description: Forbidden - unauthorized to refund
 *       404:
 *         description: Payment not found
 *       409:
 *         description: Payment not in completed status
 */
router.post(
  '/:id/refund',
  authenticate,
  validate(refundPaymentSchema),
  processRefund
);

/**
 * @openapi
 * /api/v1/payments/my-payments:
 *   get:
 *     summary: List payment transaction ledger for the authenticated user
 *     tags:
 *       - Payments & Saga Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, refunded]
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
 *         description: Payment ledger entries retrieved successfully
 */
router.get(
  '/my-payments',
  authenticate,
  validate(listPaymentsQuerySchema),
  getMyPayments
);

/**
 * @openapi
 * /api/v1/payments/{id}:
 *   get:
 *     summary: Get payment details by payment ID
 *     tags:
 *       - Payments & Saga Ledger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Payment details retrieved
 *       403:
 *         description: Forbidden - unauthorized access
 *       404:
 *         description: Payment record not found
 */
router.get(
  '/:id',
  authenticate,
  validate(paymentIdParamSchema),
  getPaymentById
);

export default router;
