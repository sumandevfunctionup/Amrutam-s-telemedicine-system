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
 * List consultations scoped by caller role with filters and pagination
 * GET /api/v1/consultations
 */
export async function listConsultations(req, res, next) {
  try {
    const { status, type, startDate, endDate, page = 1, limit = 20 } = req.query;

    const baseQuery = db('consultations')
      .join('availability_slots', 'consultations.slot_id', 'availability_slots.id')
      .join('doctors', 'consultations.doctor_id', 'doctors.id')
      .join('users as doc_user', 'doctors.user_id', 'doc_user.id')
      .join('profiles as doc_profile', 'doc_user.id', 'doc_profile.user_id')
      .join('users as pat_user', 'consultations.patient_id', 'pat_user.id')
      .join('profiles as pat_profile', 'pat_user.id', 'pat_profile.user_id');

    // Role-based scoping
    if (req.user.role === 'patient') {
      baseQuery.where('consultations.patient_id', req.user.id);
    } else if (req.user.role === 'doctor') {
      const doctor = await db('doctors').where({ user_id: req.user.id }).first();
      if (!doctor) {
        return notFound(res, 'Doctor profile not found for this account');
      }
      baseQuery.where('consultations.doctor_id', doctor.id);
    }
    // Admins see all consultations

    if (status) {
      baseQuery.where('consultations.status', status);
    }

    if (type) {
      baseQuery.where('consultations.type', type);
    }

    if (startDate) {
      const parsedStart = new Date(startDate);
      if (!isNaN(parsedStart.getTime())) {
        baseQuery.where('availability_slots.start_time', '>=', parsedStart.toISOString());
      }
    }

    if (endDate) {
      const parsedEnd = new Date(endDate);
      if (!isNaN(parsedEnd.getTime())) {
        baseQuery.where('availability_slots.end_time', '<=', parsedEnd.toISOString());
      }
    }

    const [{ count }] = await baseQuery.clone().count('consultations.id as count');
    const total = parseInt(count, 10);

    const consultations = await baseQuery
      .select(
        'consultations.id',
        'consultations.status',
        'consultations.type',
        'consultations.meeting_link',
        'consultations.notes',
        'consultations.created_at',
        'consultations.updated_at',
        'availability_slots.id as slot_id',
        'availability_slots.start_time',
        'availability_slots.end_time',
        'doctors.id as doctor_id',
        'doctors.specialization',
        'doctors.consultation_fee',
        'doc_profile.first_name as doctor_first_name',
        'doc_profile.last_name as doctor_last_name',
        'pat_user.id as patient_id',
        'pat_user.email as patient_email',
        'pat_profile.first_name as patient_first_name',
        'pat_profile.last_name as patient_last_name'
      )
      .orderBy('availability_slots.start_time', 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    return ok(res, {
      consultations,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get detailed consultation information by ID
 * GET /api/v1/consultations/:id
 */
export async function getConsultationById(req, res, next) {
  try {
    const { id } = req.params;

    const consultation = await db('consultations')
      .join('availability_slots', 'consultations.slot_id', 'availability_slots.id')
      .join('doctors', 'consultations.doctor_id', 'doctors.id')
      .join('users as doc_user', 'doctors.user_id', 'doc_user.id')
      .join('profiles as doc_profile', 'doc_user.id', 'doc_profile.user_id')
      .join('users as pat_user', 'consultations.patient_id', 'pat_user.id')
      .join('profiles as pat_profile', 'pat_user.id', 'pat_profile.user_id')
      .where('consultations.id', id)
      .select(
        'consultations.id',
        'consultations.status',
        'consultations.type',
        'consultations.meeting_link',
        'consultations.notes',
        'consultations.created_at',
        'consultations.updated_at',
        'availability_slots.id as slot_id',
        'availability_slots.start_time',
        'availability_slots.end_time',
        'doctors.id as doctor_id',
        'doctors.user_id as doctor_user_id',
        'doctors.specialization',
        'doctors.license_number',
        'doc_profile.first_name as doctor_first_name',
        'doc_profile.last_name as doctor_last_name',
        'pat_user.id as patient_id',
        'pat_user.email as patient_email',
        'pat_profile.first_name as patient_first_name',
        'pat_profile.last_name as patient_last_name'
      )
      .first();

    if (!consultation) {
      return notFound(res, 'Consultation not found');
    }

    // Ownership check: must be patient, doctor of the consultation, or admin
    const isPatient = consultation.patient_id === req.user.id;
    const isDoctor = consultation.doctor_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isPatient && !isDoctor && !isAdmin) {
      return forbidden(res, 'You do not have permission to view this consultation');
    }

    // Check if a digital prescription has been issued for this consultation
    const prescription = await db('prescriptions')
      .where({ consultation_id: consultation.id })
      .first();

    return ok(res, {
      ...consultation,
      has_prescription: !!prescription,
      prescription_id: prescription ? prescription.id : null,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Start a consultation session (scheduled -> in_progress)
 * PATCH /api/v1/consultations/:id/start
 */
export async function startConsultation(req, res, next) {
  try {
    const { id } = req.params;

    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    if (!doctor) {
      return notFound(res, 'Doctor profile not found for this account');
    }

    try {
      const updated = await db.transaction(async (trx) => {
        const consultation = await trx('consultations')
          .where({ id })
          .forUpdate()
          .first();

        if (!consultation) {
          const err = new Error('Consultation not found');
          err.statusCode = 404;
          throw err;
        }

        if (consultation.doctor_id !== doctor.id && req.user.role !== 'admin') {
          const err = new Error('Only the assigned doctor can start this consultation');
          err.statusCode = 403;
          throw err;
        }

        // State Machine validation
        if (consultation.status !== 'scheduled') {
          const err = new Error(
            `Cannot start consultation with status '${consultation.status}'. Must be 'scheduled'.`
          );
          err.isConflict = true;
          throw err;
        }

        const [result] = await trx('consultations')
          .where({ id })
          .update({
            status: 'in_progress',
            updated_at: db.fn.now(),
          })
          .returning('*');

        await trx('audit_logs').insert({
          user_id: req.user.id,
          action: 'CONSULTATION_STARTED',
          entity_type: 'consultations',
          entity_id: id,
          ip_address: req.ip || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent'],
          details: JSON.stringify({ previousStatus: 'scheduled', newStatus: 'in_progress' }),
        });

        return result;
      });

      return ok(
        res,
        updated,
        'Consultation started successfully. Virtual meeting room is now active.'
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
 * Complete a consultation session (in_progress -> completed) and optionally record notes
 * PATCH /api/v1/consultations/:id/complete
 */
export async function completeConsultation(req, res, next) {
  try {
    const { id } = req.params;
    const { notes, soap } = req.body;

    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    if (!doctor) {
      return notFound(res, 'Doctor profile not found for this account');
    }

    try {
      const updated = await db.transaction(async (trx) => {
        const consultation = await trx('consultations')
          .where({ id })
          .forUpdate()
          .first();

        if (!consultation) {
          const err = new Error('Consultation not found');
          err.statusCode = 404;
          throw err;
        }

        if (consultation.doctor_id !== doctor.id && req.user.role !== 'admin') {
          const err = new Error('Only the assigned doctor can complete this consultation');
          err.statusCode = 403;
          throw err;
        }

        // State Machine check: Must be in_progress (or scheduled for direct completions)
        if (consultation.status !== 'in_progress' && consultation.status !== 'scheduled') {
          const err = new Error(
            `Cannot complete consultation with status '${consultation.status}'. Must be 'in_progress' or 'scheduled'.`
          );
          err.isConflict = true;
          throw err;
        }

        // Format SOAP notes if provided
        let finalNotes = consultation.notes || '';
        if (soap) {
          const soapParts = [
            soap.subjective ? `[Subjective (Lakshana)]\n${soap.subjective}` : '',
            soap.objective ? `[Objective (Nadi / Pariksha)]\n${soap.objective}` : '',
            soap.assessment ? `[Assessment (Nidana / Dosha)]\n${soap.assessment}` : '',
            soap.plan ? `[Plan (Chikitsa / Pathya)]\n${soap.plan}` : '',
          ].filter(Boolean);

          const soapText = soapParts.join('\n\n');
          finalNotes = finalNotes ? `${finalNotes}\n\n${soapText}` : soapText;
        } else if (notes) {
          finalNotes = notes;
        }

        const [result] = await trx('consultations')
          .where({ id })
          .update({
            status: 'completed',
            notes: finalNotes || consultation.notes,
            updated_at: db.fn.now(),
          })
          .returning('*');

        await trx('audit_logs').insert({
          user_id: req.user.id,
          action: 'CONSULTATION_COMPLETED',
          entity_type: 'consultations',
          entity_id: id,
          ip_address: req.ip || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent'],
          details: JSON.stringify({
            previousStatus: consultation.status,
            newStatus: 'completed',
          }),
        });

        return result;
      });

      return ok(
        res,
        updated,
        'Consultation completed successfully. Session is now ready for prescription issuance.'
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
 * Record or update Ayurvedic clinical SOAP notes
 * PATCH /api/v1/consultations/:id/notes
 */
export async function updateConsultationNotes(req, res, next) {
  try {
    const { id } = req.params;
    const { notes, subjective, objective, assessment, plan } = req.body;

    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    if (!doctor) {
      return notFound(res, 'Doctor profile not found for this account');
    }

    const consultation = await db('consultations').where({ id }).first();
    if (!consultation) {
      return notFound(res, 'Consultation not found');
    }

    if (consultation.doctor_id !== doctor.id && req.user.role !== 'admin') {
      return forbidden(res, 'Only the assigned doctor can record clinical notes');
    }

    if (consultation.status === 'cancelled') {
      return conflict(res, 'Cannot add clinical notes to a cancelled consultation');
    }

    // Build structured SOAP note
    const parts = [];
    if (subjective) parts.push(`[Subjective (Lakshana)]\n${subjective}`);
    if (objective) parts.push(`[Objective (Nadi / Pariksha)]\n${objective}`);
    if (assessment) parts.push(`[Assessment (Nidana / Dosha)]\n${assessment}`);
    if (plan) parts.push(`[Plan (Chikitsa / Pathya)]\n${plan}`);
    if (notes) parts.push(`[Additional Clinical Notes]\n${notes}`);

    const formattedNotes = parts.length > 0 ? parts.join('\n\n') : (notes || consultation.notes);

    const [updated] = await db('consultations')
      .where({ id })
      .update({
        notes: formattedNotes,
        updated_at: db.fn.now(),
      })
      .returning('*');

    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'CONSULTATION_NOTES_UPDATED',
      entity_type: 'consultations',
      entity_id: id,
      ip_address: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers['user-agent'],
      details: JSON.stringify({ hasSoap: !!(subjective || objective || assessment || plan) }),
    });

    return ok(res, updated, 'Ayurvedic clinical SOAP notes updated successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel a consultation and release availability slot
 * PATCH /api/v1/consultations/:id/cancel
 */
export async function cancelConsultation(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    try {
      const result = await db.transaction(async (trx) => {
        const consultation = await trx('consultations')
          .where({ id })
          .forUpdate()
          .first();

        if (!consultation) {
          const err = new Error('Consultation not found');
          err.statusCode = 404;
          throw err;
        }

        // Ownership check
        const isPatient = consultation.patient_id === req.user.id;
        const doctor = await trx('doctors')
          .where({ id: consultation.doctor_id, user_id: req.user.id })
          .first();
        const isAdmin = req.user.role === 'admin';

        if (!isPatient && !doctor && !isAdmin) {
          const err = new Error('You do not have permission to cancel this consultation');
          err.statusCode = 403;
          throw err;
        }

        // State Machine invariant: cannot cancel completed consultation
        if (consultation.status === 'completed') {
          const err = new Error('Cannot cancel a consultation that has already been completed');
          err.isConflict = true;
          throw err;
        }

        if (consultation.status === 'cancelled') {
          const err = new Error('Consultation is already cancelled');
          err.isConflict = true;
          throw err;
        }

        const cancelNote = reason
          ? `${consultation.notes ? consultation.notes + ' | ' : ''}Cancellation Reason: ${reason}`
          : consultation.notes;

        const [updatedConsultation] = await trx('consultations')
          .where({ id })
          .update({
            status: 'cancelled',
            notes: cancelNote,
            updated_at: db.fn.now(),
          })
          .returning('*');

        // Release the slot back to available
        await trx('availability_slots')
          .where({ id: consultation.slot_id })
          .update({
            status: 'available',
            updated_at: db.fn.now(),
          });

        await trx('audit_logs').insert({
          user_id: req.user.id,
          action: 'CONSULTATION_CANCELLED',
          entity_type: 'consultations',
          entity_id: id,
          ip_address: req.ip || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent'],
          details: JSON.stringify({ cancelled_by: req.user.id, reason }),
        });

        return updatedConsultation;
      });

      return ok(
        res,
        result,
        'Consultation cancelled successfully and availability slot released back to schedule'
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
