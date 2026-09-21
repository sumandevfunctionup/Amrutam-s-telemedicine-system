import { db } from '../db/db.js';
import {
  ok,
  created,
  badRequest,
  notFound,
  forbidden,
  conflict,
} from '../helper/apiResponse.js';

/**
 * Doctor creates and signs an immutable digital Ayurvedic prescription
 * POST /api/v1/consultations/:id/prescription
 */
export async function createPrescription(req, res, next) {
  try {
    const { id } = req.params;
    const { diagnosis, medications, instructions, follow_up_date } = req.body;

    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    if (!doctor) {
      return notFound(res, 'Doctor profile not found for this account');
    }

    try {
      const result = await db.transaction(async (trx) => {
        // 1. Lock consultation
        const consultation = await trx('consultations')
          .where({ id })
          .forUpdate()
          .first();

        if (!consultation) {
          const err = new Error('Consultation not found');
          err.statusCode = 404;
          throw err;
        }

        // 2. Doctor ownership check
        if (consultation.doctor_id !== doctor.id && req.user.role !== 'admin') {
          const err = new Error('Only the assigned doctor can issue a prescription for this consultation');
          err.statusCode = 403;
          throw err;
        }

        // 3. Status validation: cannot prescribe for cancelled or no_show consultations
        if (consultation.status === 'cancelled' || consultation.status === 'no_show') {
          const err = new Error(
            `Cannot issue prescription for consultation with status '${consultation.status}'`
          );
          err.isConflict = true;
          throw err;
        }

        // 4. Immutability & Unique Check: only one prescription per consultation
        const existingRx = await trx('prescriptions')
          .where({ consultation_id: id })
          .first();

        if (existingRx) {
          const err = new Error(
            'A digital prescription has already been issued for this consultation. Digital prescriptions are legally immutable.'
          );
          err.isConflict = true;
          throw err;
        }

        // Format instructions if follow_up_date is provided
        const fullInstructions = [
          instructions || '',
          follow_up_date ? `[Follow-up Date]: ${follow_up_date}` : '',
        ].filter(Boolean).join('\n\n');

        // 5. Insert digital prescription
        const [prescription] = await trx('prescriptions')
          .insert({
            consultation_id: id,
            doctor_id: doctor.id,
            patient_id: consultation.patient_id,
            diagnosis,
            medications: JSON.stringify(medications),
            instructions: fullInstructions || null,
            issued_at: db.fn.now(),
          })
          .returning('*');

        // 6. Automatically complete consultation if not already completed
        if (consultation.status !== 'completed') {
          await trx('consultations')
            .where({ id })
            .update({
              status: 'completed',
              updated_at: db.fn.now(),
            });
        }

        // 7. Audit log
        await trx('audit_logs').insert({
          user_id: req.user.id,
          action: 'PRESCRIPTION_ISSUED',
          entity_type: 'prescriptions',
          entity_id: prescription.id,
          ip_address: req.ip || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent'],
          details: JSON.stringify({
            consultation_id: id,
            patient_id: consultation.patient_id,
            item_count: medications.length,
          }),
        });

        return prescription;
      });

      // Parse medications JSON if returned as string
      if (typeof result.medications === 'string') {
        try {
          result.medications = JSON.parse(result.medications);
        } catch (_) {}
      }

      return created(
        res,
        result,
        'Digital Ayurvedic prescription issued and signed successfully'
      );
    } catch (txErr) {
      if (txErr.isConflict) return conflict(res, txErr.message);
      if (txErr.statusCode === 404) return notFound(res, txErr.message);
      if (txErr.statusCode === 403) return forbidden(res, txErr.message);
      throw txErr;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve prescription for a given consultation
 * GET /api/v1/consultations/:id/prescription
 */
export async function getPrescriptionByConsultation(req, res, next) {
  try {
    const { id } = req.params;

    const consultation = await db('consultations').where({ id }).first();
    if (!consultation) {
      return notFound(res, 'Consultation not found');
    }

    // Access control
    const isPatient = consultation.patient_id === req.user.id;
    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    const isDoctor = doctor && consultation.doctor_id === doctor.id;
    const isAdmin = req.user.role === 'admin';

    if (!isPatient && !isDoctor && !isAdmin) {
      return forbidden(res, 'You do not have permission to view this prescription');
    }

    const prescription = await db('prescriptions')
      .join('doctors', 'prescriptions.doctor_id', 'doctors.id')
      .join('users as doc_user', 'doctors.user_id', 'doc_user.id')
      .join('profiles as doc_profile', 'doc_user.id', 'doc_profile.user_id')
      .join('users as pat_user', 'prescriptions.patient_id', 'pat_user.id')
      .join('profiles as pat_profile', 'pat_user.id', 'pat_profile.user_id')
      .where('prescriptions.consultation_id', id)
      .select(
        'prescriptions.id',
        'prescriptions.consultation_id',
        'prescriptions.diagnosis',
        'prescriptions.medications',
        'prescriptions.instructions',
        'prescriptions.issued_at',
        'doctors.id as doctor_id',
        'doctors.specialization',
        'doctors.license_number',
        'doc_profile.first_name as doctor_first_name',
        'doc_profile.last_name as doctor_last_name',
        'pat_user.id as patient_id',
        'pat_profile.first_name as patient_first_name',
        'pat_profile.last_name as patient_last_name'
      )
      .first();

    if (!prescription) {
      return notFound(res, 'No prescription found for this consultation');
    }

    if (typeof prescription.medications === 'string') {
      try {
        prescription.medications = JSON.parse(prescription.medications);
      } catch (_) {}
    }

    return ok(res, prescription, 'Prescription retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve prescription by its ID
 * GET /api/v1/prescriptions/:id
 */
export async function getPrescriptionById(req, res, next) {
  try {
    const { id } = req.params;

    const prescription = await db('prescriptions')
      .join('doctors', 'prescriptions.doctor_id', 'doctors.id')
      .join('users as doc_user', 'doctors.user_id', 'doc_user.id')
      .join('profiles as doc_profile', 'doc_user.id', 'doc_profile.user_id')
      .join('users as pat_user', 'prescriptions.patient_id', 'pat_user.id')
      .join('profiles as pat_profile', 'pat_user.id', 'pat_profile.user_id')
      .where('prescriptions.id', id)
      .select(
        'prescriptions.id',
        'prescriptions.consultation_id',
        'prescriptions.diagnosis',
        'prescriptions.medications',
        'prescriptions.instructions',
        'prescriptions.issued_at',
        'doctors.id as doctor_id',
        'doctors.user_id as doctor_user_id',
        'doctors.specialization',
        'doctors.license_number',
        'doc_profile.first_name as doctor_first_name',
        'doc_profile.last_name as doctor_last_name',
        'pat_user.id as patient_id',
        'pat_profile.first_name as patient_first_name',
        'pat_profile.last_name as patient_last_name'
      )
      .first();

    if (!prescription) {
      return notFound(res, 'Prescription not found');
    }

    // Access control
    const isPatient = prescription.patient_id === req.user.id;
    const isDoctor = prescription.doctor_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isPatient && !isDoctor && !isAdmin) {
      return forbidden(res, 'You do not have permission to view this prescription');
    }

    if (typeof prescription.medications === 'string') {
      try {
        prescription.medications = JSON.parse(prescription.medications);
      } catch (_) {}
    }

    return ok(res, prescription, 'Prescription details retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Longitudinal Electronic Health Records (EHR): Get all prescriptions for a patient
 * GET /api/v1/prescriptions/patient/:patientId
 */
export async function getPatientPrescriptions(req, res, next) {
  try {
    const { patientId } = req.params;

    // Access control
    const isPatient = req.user.id === patientId;
    const isDoctor = req.user.role === 'doctor';
    const isAdmin = req.user.role === 'admin';

    if (!isPatient && !isDoctor && !isAdmin) {
      return forbidden(res, 'You do not have permission to view this patient health record');
    }

    const prescriptions = await db('prescriptions')
      .join('doctors', 'prescriptions.doctor_id', 'doctors.id')
      .join('users as doc_user', 'doctors.user_id', 'doc_user.id')
      .join('profiles as doc_profile', 'doc_user.id', 'doc_profile.user_id')
      .where('prescriptions.patient_id', patientId)
      .select(
        'prescriptions.id',
        'prescriptions.consultation_id',
        'prescriptions.diagnosis',
        'prescriptions.medications',
        'prescriptions.instructions',
        'prescriptions.issued_at',
        'doctors.specialization',
        'doc_profile.first_name as doctor_first_name',
        'doc_profile.last_name as doctor_last_name'
      )
      .orderBy('prescriptions.issued_at', 'desc');

    const formattedPrescriptions = prescriptions.map((p) => {
      let meds = p.medications;
      if (typeof meds === 'string') {
        try {
          meds = JSON.parse(meds);
        } catch (_) {}
      }
      return {
        ...p,
        medications: meds,
      };
    });

    return ok(
      res,
      formattedPrescriptions,
      'Patient electronic health records (EHR) retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
}
