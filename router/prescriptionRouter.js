import { Router } from 'express';
import {
  getPrescriptionById,
  getPatientPrescriptions,
} from '../controller/prescriptionController.js';
import { authenticate } from '../auth/middleware.js';
import { validate } from '../helper/validator.js';
import {
  prescriptionIdParamSchema,
  patientIdParamSchema,
} from '../helper/schemas.js';

const router = Router();

/**
 * @openapi
 * /api/v1/prescriptions/{id}:
 *   get:
 *     summary: Retrieve a digital prescription by prescription ID
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
 *         description: Digital prescription retrieved successfully
 *       403:
 *         description: Forbidden - unauthorized access to medical records
 *       404:
 *         description: Prescription not found
 */
router.get(
  '/:id',
  authenticate,
  validate(prescriptionIdParamSchema),
  getPrescriptionById
);

/**
 * @openapi
 * /api/v1/prescriptions/patient/{patientId}:
 *   get:
 *     summary: Retrieve longitudinal electronic health records (EHR) for a patient
 *     tags:
 *       - Prescriptions & EHR
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Patient prescription history returned
 *       403:
 *         description: Forbidden - unauthorized access to other patients' records
 */
router.get(
  '/patient/:patientId',
  authenticate,
  validate(patientIdParamSchema),
  getPatientPrescriptions
);

export default router;
