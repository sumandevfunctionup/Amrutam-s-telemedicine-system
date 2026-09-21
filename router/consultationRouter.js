import { Router } from 'express';
import {
  listConsultations,
  getConsultationById,
  startConsultation,
  completeConsultation,
  updateConsultationNotes,
  cancelConsultation,
} from '../controller/consultationController.js';
import {
  createPrescription,
  getPrescriptionByConsultation,
} from '../controller/prescriptionController.js';
import { authenticate, authorize, idempotency } from '../auth/middleware.js';
import { validate } from '../helper/validator.js';
import {
  listConsultationsSchema,
  consultationIdParamSchema,
  completeConsultationSchema,
  updateSoapNotesSchema,
  cancelConsultationSchema,
  createPrescriptionSchema,
} from '../helper/schemas.js';

const router = Router();

/**
 * @openapi
 * /api/v1/consultations:
 *   get:
 *     summary: List consultations scoped by caller role (patient sees theirs, doctor sees their schedule)
 *     tags:
 *       - Consultation Lifecycle
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, in_progress, completed, cancelled, no_show]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [video, audio, chat]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
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
 *         description: List of consultations returned successfully
 */
router.get(
  '/',
  authenticate,
  validate(listConsultationsSchema),
  listConsultations
);

/**
 * @openapi
 * /api/v1/consultations/{id}:
 *   get:
 *     summary: Retrieve consultation details and virtual meeting credentials
 *     tags:
 *       - Consultation Lifecycle
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
 *         description: Consultation details returned
 *       403:
 *         description: Forbidden - unauthorized to view this consultation
 *       404:
 *         description: Consultation not found
 */
router.get(
  '/:id',
  authenticate,
  validate(consultationIdParamSchema),
  getConsultationById
);

/**
 * @openapi
 * /api/v1/consultations/{id}/start:
 *   patch:
 *     summary: Doctor starts consultation session (scheduled -> in_progress)
 *     tags:
 *       - Consultation Lifecycle
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
 *         description: Consultation started and room active
 *       403:
 *         description: Forbidden - only assigned doctor can start
 *       409:
 *         description: State conflict - status is not scheduled
 */
router.patch(
  '/:id/start',
  authenticate,
  authorize('doctor', 'admin'),
  validate(consultationIdParamSchema),
  startConsultation
);

/**
 * @openapi
 * /api/v1/consultations/{id}/complete:
 *   patch:
 *     summary: Doctor marks consultation completed and saves final SOAP notes
 *     tags:
 *       - Consultation Lifecycle
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
 *               notes:
 *                 type: string
 *               soap:
 *                 type: object
 *                 properties:
 *                   subjective:
 *                     type: string
 *                   objective:
 *                     type: string
 *                   assessment:
 *                     type: string
 *                   plan:
 *                     type: string
 *     responses:
 *       200:
 *         description: Consultation completed successfully
 *       403:
 *         description: Forbidden - only assigned doctor can complete
 *       409:
 *         description: State conflict
 */
router.patch(
  '/:id/complete',
  authenticate,
  authorize('doctor', 'admin'),
  validate(completeConsultationSchema),
  completeConsultation
);

/**
 * @openapi
 * /api/v1/consultations/{id}/notes:
 *   patch:
 *     summary: Doctor records or updates Ayurvedic clinical SOAP notes
 *     tags:
 *       - Consultation Lifecycle
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subjective:
 *                 type: string
 *                 example: "Patient reports chronic insomnia and digestive burning."
 *               objective:
 *                 type: string
 *                 example: "Pitta pulse elevated, mild Ama coating on tongue."
 *               assessment:
 *                 type: string
 *                 example: "Tikshnagni with Pitta-Vata vitiation."
 *               plan:
 *                 type: string
 *                 example: "Prescribe cooling herbs (Brahmi, Shatavari), ghee regimen."
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Clinical notes updated successfully
 *       403:
 *         description: Forbidden - only assigned doctor can update notes
 */
router.patch(
  '/:id/notes',
  authenticate,
  authorize('doctor', 'admin'),
  validate(updateSoapNotesSchema),
  updateConsultationNotes
);

/**
 * @openapi
 * /api/v1/consultations/{id}/cancel:
 *   patch:
 *     summary: Cancel consultation session and release calendar slot
 *     tags:
 *       - Consultation Lifecycle
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
 *                 example: "Patient requested cancellation due to travel"
 *     responses:
 *       200:
 *         description: Consultation cancelled and slot released
 *       403:
 *         description: Forbidden - unauthorized to cancel
 *       409:
 *         description: Conflict - consultation already completed or cancelled
 */
/**
 * @openapi
 * /api/v1/consultations/{id}/prescription:
 *   post:
 *     summary: Doctor issues and digitally signs an immutable Ayurvedic prescription
 *     tags:
 *       - Prescriptions & EHR
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *               - diagnosis
 *               - medications
 *             properties:
 *               diagnosis:
 *                 type: string
 *                 example: "Amlapitta with Pitta-Kapha aggravation"
 *               medications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - dosage
 *                     - frequency
 *                     - timing
 *                     - duration_days
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "Avipattikar Churna"
 *                     dosage:
 *                       type: string
 *                       example: "1 tsp"
 *                     frequency:
 *                       type: string
 *                       example: "twice daily"
 *                     timing:
 *                       type: string
 *                       example: "before meals with warm water"
 *                     duration_days:
 *                       type: integer
 *                       example: 30
 *               instructions:
 *                 type: string
 *                 example: "Avoid fermented, overly spicy, and deep-fried foods. Drink coconut water daily."
 *               follow_up_date:
 *                 type: string
 *                 example: "2026-10-20"
 *     responses:
 *       201:
 *         description: Prescription issued and signed successfully
 *       403:
 *         description: Forbidden - only assigned doctor can issue prescription
 *       409:
 *         description: Conflict - prescription already issued or consultation cancelled
 */
router.post(
  '/:id/prescription',
  authenticate,
  authorize('doctor', 'admin'),
  idempotency,
  validate(createPrescriptionSchema),
  createPrescription
);

/**
 * @openapi
 * /api/v1/consultations/{id}/prescription:
 *   get:
 *     summary: Retrieve digital prescription for a consultation
 *     tags:
 *       - Prescriptions & EHR
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
 *         description: Prescription retrieved successfully
 *       403:
 *         description: Forbidden - unauthorized access
 *       404:
 *         description: Prescription not found
 */
router.get(
  '/:id/prescription',
  authenticate,
  validate(consultationIdParamSchema),
  getPrescriptionByConsultation
);

export default router;
