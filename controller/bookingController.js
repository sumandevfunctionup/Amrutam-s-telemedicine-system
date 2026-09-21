import { db } from '../db/db.js';
import {
  ok,
  created,
  badRequest,
  notFound,
  forbidden,
  conflict,
} from '../helper/apiResponse.js';
import { acquireDistributedLock, releaseDistributedLock, cacheDel } from '../helper/redis.js';
import { queueConsultationConfirmation, queueInvoiceGeneration } from '../helper/asyncQueue.js';

/**
 * Lock/Reserve an available slot for checkout (Pessimistic Row-Level Lock + Optimistic Versioning)
 * POST /api/v1/bookings/lock
 */
export async function lockSlot(req, res, next) {
  try {
    const { slot_id } = req.body;
    const lockToken = req.user?.id || `anon-${Date.now()}`;

    // 1. Fast Distributed Mutex in Redis (Sub-5ms conflict detection)
    const lockAcquired = await acquireDistributedLock(`slot:${slot_id}`, lockToken, 600);
    if (!lockAcquired) {
      return conflict(
        res,
        'Slot is currently being reserved by another patient. Please choose another slot.'
      );
    }

    try {
      const result = await db.transaction(async (trx) => {
        // 2. Pessimistic Row-Level Lock on the slot in DB
        const slot = await trx('availability_slots')
          .where({ id: slot_id })
          .forUpdate()
          .first();

        if (!slot) {
          const err = new Error('Availability slot not found');
          err.statusCode = 404;
          throw err;
        }

        // 3. Disallow reserving past slots
        if (new Date(slot.start_time) <= new Date()) {
          const err = new Error('Cannot reserve an availability slot in the past');
          err.statusCode = 400;
          throw err;
        }

        // 4. Status check
        if (slot.status !== 'available') {
          const err = new Error(
            `Slot is no longer available for booking (current status: '${slot.status}')`
          );
          err.isConflict = true;
          throw err;
        }

        // 5. Update status to 'locked' and increment version
        const [lockedSlot] = await trx('availability_slots')
          .where({ id: slot_id })
          .update({
            status: 'locked',
            version: slot.version + 1,
            updated_at: db.fn.now(),
          })
          .returning('*');

        // 6. Audit log
        await trx('audit_logs').insert({
          user_id: req.user.id,
          action: 'SLOT_LOCKED',
          entity_type: 'availability_slots',
          entity_id: slot_id,
          ip_address: req.ip || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent'],
          details: JSON.stringify({
            slot_id,
            doctor_id: slot.doctor_id,
            version: slot.version + 1,
          }),
        });

        // 7. Calculate 10-minute checkout expiration
        const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        return {
          slot: lockedSlot,
          expires_at,
          doctor_id: slot.doctor_id,
        };
      });

      // Invalidate slots cache in Redis
      await Promise.all([
        cacheDel(`amrutam:doctor:slots:${result.doctor_id}:*`),
        cacheDel('amrutam:search:*'),
      ]);

      return ok(
        res,
        result,
        'Slot reserved successfully. Please complete booking within 10 minutes.'
      );
    } catch (txErr) {
      // If DB transaction failed, release Redis distributed lock immediately
      await releaseDistributedLock(`slot:${slot_id}`, lockToken);

      if (txErr.isConflict) {
        return conflict(res, txErr.message);
      }
      if (txErr.statusCode === 404) {
        return notFound(res, txErr.message);
      }
      if (txErr.statusCode === 400) {
        return badRequest(res, txErr.message);
      }
      throw txErr;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Finalize and confirm booking for a locked/available slot
 * POST /api/v1/bookings/confirm
 */
export async function confirmBooking(req, res, next) {
  try {
    const { slot_id, type = 'video', notes } = req.body;

    try {
      const result = await db.transaction(async (trx) => {
        // 1. Pessimistic lock on the slot
        const slot = await trx('availability_slots')
          .where({ id: slot_id })
          .forUpdate()
          .first();

        if (!slot) {
          const err = new Error('Availability slot not found');
          err.statusCode = 404;
          throw err;
        }

        // 2. Status check: must be locked or available
        if (slot.status !== 'locked' && slot.status !== 'available') {
          const err = new Error(
            `Slot cannot be confirmed because current status is '${slot.status}'`
          );
          err.isConflict = true;
          throw err;
        }

        // 3. Disallow booking past slots
        if (new Date(slot.start_time) <= new Date()) {
          const err = new Error('Cannot book an availability slot in the past');
          err.statusCode = 400;
          throw err;
        }

        // 4. Ensure no existing consultation exists for this slot (unique constraint guard)
        const existingConsultation = await trx('consultations')
          .where({ slot_id })
          .first();

        if (existingConsultation) {
          const err = new Error('A consultation is already booked for this slot');
          err.isConflict = true;
          throw err;
        }

        // 5. Update slot to 'booked' and increment version
        const [bookedSlot] = await trx('availability_slots')
          .where({ id: slot_id })
          .update({
            status: 'booked',
            version: slot.version + 1,
            updated_at: db.fn.now(),
          })
          .returning('*');

        // 6. Look up doctor info for consultation fee
        const doctor = await trx('doctors').where({ id: slot.doctor_id }).first();

        // 7. Create scheduled consultation record
        const roomId = `amrutam-room-${slot.id.substring(0, 8)}`;
        const [consultation] = await trx('consultations')
          .insert({
            patient_id: req.user.id,
            doctor_id: slot.doctor_id,
            slot_id: slot.id,
            status: 'scheduled',
            type: type || 'video',
            notes: notes || null,
            meeting_link: `https://meet.amrutam.co.in/${roomId}`,
          })
          .returning('*');

        // 8. Create ledger payment record (default pending until gateway checkout)
        const paymentStatus = req.body.payment_status || 'pending';
        const [payment] = await trx('payments')
          .insert({
            consultation_id: consultation.id,
            patient_id: req.user.id,
            amount: doctor?.consultation_fee || 500,
            currency: 'INR',
            status: paymentStatus,
            payment_method: 'card',
            transaction_id: `TXN-${Date.now()}-${Math.floor(10000 + Math.random() * 90000)}`,
          })
          .returning('*');

        // 9. Audit log
        await trx('audit_logs').insert({
          user_id: req.user.id,
          action: 'BOOKING_CONFIRMED',
          entity_type: 'consultations',
          entity_id: consultation.id,
          ip_address: req.ip || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent'],
          details: JSON.stringify({
            consultation_id: consultation.id,
            slot_id: slot.id,
            doctor_id: slot.doctor_id,
            type,
            amount: payment.amount,
          }),
        });

        return {
          consultation,
          slot: bookedSlot,
          payment,
        };
      });

      // Release distributed lock token and invalidate caches
      await Promise.all([
        releaseDistributedLock(`slot:${slot_id}`, req.user.id),
        cacheDel(`amrutam:doctor:slots:${result.slot.doctor_id}:*`),
        cacheDel('amrutam:search:*'),
      ]);

      // Enqueue asynchronous background notification & invoice preparation jobs
      queueConsultationConfirmation({
        consultationId: result.consultation.id,
        patientEmail: req.user?.email || 'patient@amrutam.co.in',
        doctorName: `Doctor #${result.slot.doctor_id}`,
        scheduledAt: result.slot.start_time,
      }).catch((err) => console.warn('[AsyncQueue] Confirmation queue error:', err.message));

      queueInvoiceGeneration({
        paymentId: result.payment.id,
        consultationId: result.consultation.id,
        amount: result.payment.amount,
        currency: result.payment.currency,
      }).catch((err) => console.warn('[AsyncQueue] Invoice queue error:', err.message));

      return created(res, result, 'Consultation booked and confirmed successfully');
    } catch (txErr) {
      if (txErr.isConflict) {
        return conflict(res, txErr.message);
      }
      if (txErr.statusCode === 404) {
        return notFound(res, txErr.message);
      }
      if (txErr.statusCode === 400) {
        return badRequest(res, txErr.message);
      }
      throw txErr;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel a booking or release a reserved slot
 * POST /api/v1/bookings/cancel
 */
export async function cancelBooking(req, res, next) {
  try {
    const { slot_id, consultation_id, reason } = req.body;

    try {
      const result = await db.transaction(async (trx) => {
        // Case A: Releasing/cancelling by slot_id
        if (slot_id) {
          const slot = await trx('availability_slots')
            .where({ id: slot_id })
            .forUpdate()
            .first();

          if (!slot) {
            const err = new Error('Availability slot not found');
            err.statusCode = 404;
            throw err;
          }

          // A1. If locked, release back to 'available'
          if (slot.status === 'locked') {
            const [releasedSlot] = await trx('availability_slots')
              .where({ id: slot_id })
              .update({
                status: 'available',
                version: slot.version + 1,
                updated_at: db.fn.now(),
              })
              .returning('*');

            await trx('audit_logs').insert({
              user_id: req.user.id,
              action: 'SLOT_UNLOCKED',
              entity_type: 'availability_slots',
              entity_id: slot_id,
              ip_address: req.ip || req.socket?.remoteAddress,
              user_agent: req.headers['user-agent'],
              details: JSON.stringify({ slot_id, reason }),
            });

            return {
              slot_id,
              status: 'available',
              message: 'Slot hold released successfully',
            };
          }

          // A2. If booked, locate consultation and check permissions
          if (slot.status === 'booked') {
            const consultation = await trx('consultations')
              .where({ slot_id })
              .first();

            if (!consultation) {
              const err = new Error('No consultation found for this booked slot');
              err.statusCode = 404;
              throw err;
            }

            // Check authorization: patient, doctor, or admin
            const isPatient = consultation.patient_id === req.user.id;
            const doctor = await trx('doctors')
              .where({ id: consultation.doctor_id, user_id: req.user.id })
              .first();
            const isAdmin = req.user.role === 'admin';

            if (!isPatient && !doctor && !isAdmin) {
              const err = new Error('You do not have permission to cancel this booking');
              err.statusCode = 403;
              throw err;
            }

            // Update consultation to cancelled
            const [cancelledConsultation] = await trx('consultations')
              .where({ id: consultation.id })
              .update({
                status: 'cancelled',
                notes: reason
                  ? `${consultation.notes ? consultation.notes + ' | ' : ''}Cancellation reason: ${reason}`
                  : consultation.notes,
                updated_at: db.fn.now(),
              })
              .returning('*');

            // Release slot back to available
            await trx('availability_slots')
              .where({ id: slot_id })
              .update({
                status: 'available',
                version: slot.version + 1,
                updated_at: db.fn.now(),
              });

            await trx('audit_logs').insert({
              user_id: req.user.id,
              action: 'BOOKING_CANCELLED',
              entity_type: 'consultations',
              entity_id: consultation.id,
              ip_address: req.ip || req.socket?.remoteAddress,
              user_agent: req.headers['user-agent'],
              details: JSON.stringify({
                consultation_id: consultation.id,
                slot_id,
                cancelled_by: req.user.id,
                reason,
              }),
            });

            return {
              consultation_id: consultation.id,
              consultation_status: 'cancelled',
              slot_status: 'available',
              message: 'Booking cancelled successfully and slot released',
            };
          }

          const err = new Error(`Cannot cancel slot with status '${slot.status}'`);
          err.isConflict = true;
          throw err;
        }

        // Case B: Cancelling by consultation_id
        if (consultation_id) {
          const consultation = await trx('consultations')
            .where({ id: consultation_id })
            .forUpdate()
            .first();

          if (!consultation) {
            const err = new Error('Consultation not found');
            err.statusCode = 404;
            throw err;
          }

          // Check authorization
          const isPatient = consultation.patient_id === req.user.id;
          const doctor = await trx('doctors')
            .where({ id: consultation.doctor_id, user_id: req.user.id })
            .first();
          const isAdmin = req.user.role === 'admin';

          if (!isPatient && !doctor && !isAdmin) {
            const err = new Error('You do not have permission to cancel this booking');
            err.statusCode = 403;
            throw err;
          }

          if (
            consultation.status === 'cancelled' ||
            consultation.status === 'completed'
          ) {
            const err = new Error(
              `Cannot cancel a consultation that is already '${consultation.status}'`
            );
            err.isConflict = true;
            throw err;
          }

          // Update consultation to cancelled
          const [cancelledConsultation] = await trx('consultations')
            .where({ id: consultation_id })
            .update({
              status: 'cancelled',
              notes: reason
                ? `${consultation.notes ? consultation.notes + ' | ' : ''}Cancellation reason: ${reason}`
                : consultation.notes,
              updated_at: db.fn.now(),
            })
            .returning('*');

          // Release corresponding slot back to available
          await trx('availability_slots')
            .where({ id: consultation.slot_id })
            .update({
              status: 'available',
              updated_at: db.fn.now(),
            });

          await trx('audit_logs').insert({
            user_id: req.user.id,
            action: 'BOOKING_CANCELLED',
            entity_type: 'consultations',
            entity_id: consultation_id,
            ip_address: req.ip || req.socket?.remoteAddress,
            user_agent: req.headers['user-agent'],
            details: JSON.stringify({
              consultation_id,
              slot_id: consultation.slot_id,
              cancelled_by: req.user.id,
              reason,
            }),
          });

          return {
            consultation_id,
            consultation_status: 'cancelled',
            slot_status: 'available',
            message: 'Consultation cancelled successfully and slot released',
          };
        }
      });

      // Release distributed lock token and invalidate caches
      await Promise.all([
        slot_id ? releaseDistributedLock(`slot:${slot_id}`, req.user.id) : Promise.resolve(),
        cacheDel('amrutam:doctor:slots:*'),
        cacheDel('amrutam:search:*'),
      ]);

      return ok(res, result, result.message || 'Operation successful');
    } catch (txErr) {
      if (txErr.isConflict) {
        return conflict(res, txErr.message);
      }
      if (txErr.statusCode === 404) {
        return notFound(res, txErr.message);
      }
      if (txErr.statusCode === 403) {
        return forbidden(res, txErr.message);
      }
      if (txErr.statusCode === 400) {
        return badRequest(res, txErr.message);
      }
      throw txErr;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * List consultations / bookings for the authenticated user
 * GET /api/v1/bookings/my-bookings
 */
export async function getMyBookings(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const baseQuery = db('consultations')
      .join('availability_slots', 'consultations.slot_id', 'availability_slots.id')
      .join('doctors', 'consultations.doctor_id', 'doctors.id')
      .join('users as doctor_user', 'doctors.user_id', 'doctor_user.id')
      .join('profiles as doctor_profile', 'doctor_user.id', 'doctor_profile.user_id')
      .join('users as patient_user', 'consultations.patient_id', 'patient_user.id')
      .join('profiles as patient_profile', 'patient_user.id', 'patient_profile.user_id');

    // Filter by role
    if (req.user.role === 'patient') {
      baseQuery.where('consultations.patient_id', req.user.id);
    } else if (req.user.role === 'doctor') {
      const doctor = await db('doctors').where({ user_id: req.user.id }).first();
      if (!doctor) {
        return notFound(res, 'Doctor profile not found');
      }
      baseQuery.where('consultations.doctor_id', doctor.id);
    }
    // Admins see all bookings

    if (status) {
      baseQuery.where('consultations.status', status);
    }

    const [{ count }] = await baseQuery.clone().count('consultations.id as count');
    const total = parseInt(count, 10);

    const bookings = await baseQuery
      .select(
        'consultations.id as consultation_id',
        'consultations.status as consultation_status',
        'consultations.type as consultation_type',
        'consultations.meeting_link',
        'consultations.notes',
        'consultations.created_at as booked_at',
        'availability_slots.id as slot_id',
        'availability_slots.start_time',
        'availability_slots.end_time',
        'availability_slots.status as slot_status',
        'doctors.id as doctor_id',
        'doctors.specialization',
        'doctors.consultation_fee',
        'doctor_profile.first_name as doctor_first_name',
        'doctor_profile.last_name as doctor_last_name',
        'patient_profile.first_name as patient_first_name',
        'patient_profile.last_name as patient_last_name'
      )
      .orderBy('availability_slots.start_time', 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    return ok(res, {
      bookings,
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
