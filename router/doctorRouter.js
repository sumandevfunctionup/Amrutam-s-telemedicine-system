import { Router } from 'express';
import {
  listDoctors,
  getDoctorProfile,
  updateDoctorProfile,
  createAvailabilitySlots,
  getDoctorSlots,
  deleteAvailabilitySlot,
} from '../controller/doctorController.js';
import { authenticate, authorize, idempotency } from '../auth/middleware.js';
import { validate } from '../helper/validator.js';
import {
  listDoctorsSchema,
  getDoctorByIdSchema,
  updateDoctorProfileSchema,
  createSlotsSchema,
  getSlotsQuerySchema,
  deleteSlotSchema,
} from '../helper/schemas.js';

const router = Router();

/**
 * @openapi
 * /api/v1/doctors:
 *   get:
 *     summary: List verified doctors with filtering and pagination
 *     tags:
 *       - Doctors
 *     parameters:
 *       - in: query
 *         name: specialization
 *         schema:
 *           type: string
 *         description: Filter by Ayurvedic specialization (e.g. Kayachikitsa)
 *       - in: query
 *         name: minExperience
 *         schema:
 *           type: integer
 *         description: Minimum years of experience
 *       - in: query
 *         name: maxFee
 *         schema:
 *           type: number
 *         description: Maximum consultation fee
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
 *         description: List of doctors returned successfully
 */
router.get('/', validate(listDoctorsSchema), listDoctors);

/**
 * @openapi
 * /api/v1/doctors/profile:
 *   put:
 *     summary: Update doctor's own profile (bio, fee, specialization, experience)
 *     tags:
 *       - Doctors
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               specialization:
 *                 type: string
 *                 example: Kayachikitsa (Internal Medicine)
 *               experience_years:
 *                 type: integer
 *                 example: 12
 *               consultation_fee:
 *                 type: number
 *                 example: 850
 *               bio:
 *                 type: string
 *                 example: Senior Ayurvedic physician specializing in chronic lifestyle disorders.
 *     responses:
 *       200:
 *         description: Doctor profile updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - only doctors can update doctor profiles
 */
router.put(
  '/profile',
  authenticate,
  authorize('doctor'),
  idempotency,
  validate(updateDoctorProfileSchema),
  updateDoctorProfile
);

/**
 * @openapi
 * /api/v1/doctors/slots:
 *   post:
 *     summary: Batch create calendar availability slots
 *     tags:
 *       - Doctor Availability
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional idempotency key for safe retries
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - slots
 *             properties:
 *               slots:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - start_time
 *                     - end_time
 *                   properties:
 *                     start_time:
 *                       type: string
 *                       example: "2026-09-25T09:00:00.000Z"
 *                     end_time:
 *                       type: string
 *                       example: "2026-09-25T09:30:00.000Z"
 *     responses:
 *       201:
 *         description: Availability slots created successfully
 *       400:
 *         description: Invalid slot timestamps or internal overlaps
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - only doctors can create slots
 *       409:
 *         description: Overlapping slot already exists in schedule
 */
router.post(
  '/slots',
  authenticate,
  authorize('doctor'),
  idempotency,
  validate(createSlotsSchema),
  createAvailabilitySlots
);

/**
 * @openapi
 * /api/v1/doctors/slots/{slotId}:
 *   delete:
 *     summary: Cancel an available calendar slot
 *     tags:
 *       - Doctor Availability
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Availability slot cancelled successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - doctor can only cancel their own slots
 *       404:
 *         description: Slot not found
 *       409:
 *         description: Cannot cancel a locked or booked slot
 */
router.delete(
  '/slots/:slotId',
  authenticate,
  authorize('doctor'),
  validate(deleteSlotSchema),
  deleteAvailabilitySlot
);

/**
 * @openapi
 * /api/v1/doctors/{doctorId}/slots:
 *   get:
 *     summary: Query public availability slots for a doctor
 *     tags:
 *       - Doctor Availability
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: Filter slots starting from this date/time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: Filter slots ending before this date/time
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [available, locked, booked, cancelled]
 *           default: available
 *     responses:
 *       200:
 *         description: Availability slots returned
 *       404:
 *         description: Doctor not found
 */
router.get('/:doctorId/slots', validate(getSlotsQuerySchema), getDoctorSlots);

/**
 * @openapi
 * /api/v1/doctors/{id}:
 *   get:
 *     summary: Get public doctor profile by ID
 *     tags:
 *       - Doctors
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Doctor profile returned
 *       404:
 *         description: Doctor not found
 */
router.get('/:id', validate(getDoctorByIdSchema), getDoctorProfile);

export default router;
