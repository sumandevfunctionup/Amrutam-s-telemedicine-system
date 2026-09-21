import { Router } from 'express';
import {
  lockSlot,
  confirmBooking,
  cancelBooking,
  getMyBookings,
} from '../controller/bookingController.js';
import { authenticate, authorize, idempotency } from '../auth/middleware.js';
import { validate } from '../helper/validator.js';
import {
  lockSlotSchema,
  confirmBookingSchema,
  cancelBookingSchema,
  listBookingsQuerySchema,
} from '../helper/schemas.js';

const router = Router();

/**
 * @openapi
 * /api/v1/bookings/lock:
 *   post:
 *     summary: Reserve/lock an available slot for checkout (High-concurrency safe)
 *     tags:
 *       - Bookings & Scheduling
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Safe retry token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - slot_id
 *             properties:
 *               slot_id:
 *                 type: string
 *                 format: uuid
 *                 example: "8688b2ae-feeb-4c14-b275-ab324082451e"
 *     responses:
 *       200:
 *         description: Slot locked for 10 minutes
 *       400:
 *         description: Invalid input or slot in the past
 *       404:
 *         description: Slot not found
 *       409:
 *         description: Slot is no longer available (already locked or booked)
 */
router.post(
  '/lock',
  authenticate,
  authorize('patient', 'admin'),
  idempotency,
  validate(lockSlotSchema),
  lockSlot
);

/**
 * @openapi
 * /api/v1/bookings/confirm:
 *   post:
 *     summary: Confirm consultation booking for a locked or available slot
 *     tags:
 *       - Bookings & Scheduling
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
 *               - slot_id
 *             properties:
 *               slot_id:
 *                 type: string
 *                 format: uuid
 *               type:
 *                 type: string
 *                 enum: [video, audio, chat]
 *                 default: video
 *               notes:
 *                 type: string
 *                 example: "Experiencing Vata imbalance symptoms, digestive stiffness."
 *     responses:
 *       201:
 *         description: Booking confirmed and consultation scheduled
 *       404:
 *         description: Slot not found
 *       409:
 *         description: Slot is already booked or conflict occurred
 */
router.post(
  '/confirm',
  authenticate,
  authorize('patient', 'admin'),
  idempotency,
  validate(confirmBookingSchema),
  confirmBooking
);

/**
 * @openapi
 * /api/v1/bookings/cancel:
 *   post:
 *     summary: Cancel a booked consultation or release a slot reservation
 *     tags:
 *       - Bookings & Scheduling
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               slot_id:
 *                 type: string
 *                 format: uuid
 *               consultation_id:
 *                 type: string
 *                 format: uuid
 *               reason:
 *                 type: string
 *                 example: "Schedule conflict"
 *     responses:
 *       200:
 *         description: Booking cancelled or slot released successfully
 *       403:
 *         description: Forbidden - not authorized to cancel this booking
 *       404:
 *         description: Slot or consultation not found
 *       409:
 *         description: Cannot cancel completed or already cancelled consultation
 */
router.post(
  '/cancel',
  authenticate,
  validate(cancelBookingSchema),
  cancelBooking
);

/**
 * @openapi
 * /api/v1/bookings/my-bookings:
 *   get:
 *     summary: Retrieve bookings & scheduled consultations for the logged-in user
 *     tags:
 *       - Bookings & Scheduling
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, in_progress, completed, cancelled, no_show]
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
 *         description: User bookings retrieved successfully
 */
router.get(
  '/my-bookings',
  authenticate,
  validate(listBookingsQuerySchema),
  getMyBookings
);

export default router;
