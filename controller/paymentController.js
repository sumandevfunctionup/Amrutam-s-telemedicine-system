import { db } from '../db/db.js';
import {
  ok,
  created,
  badRequest,
  notFound,
  forbidden,
  conflict,
} from '../helper/apiResponse.js';
import { queueInvoiceGeneration } from '../helper/asyncQueue.js';

/**
 * Initiate checkout / payment order for a consultation
 * POST /api/v1/payments/initiate
 */
export async function initiatePayment(req, res, next) {
  try {
    const { consultation_id, payment_method = 'upi' } = req.body;

    const consultation = await db('consultations')
      .where({ id: consultation_id })
      .first();

    if (!consultation) {
      return notFound(res, 'Consultation not found');
    }

    if (consultation.patient_id !== req.user.id && req.user.role !== 'admin') {
      return forbidden(res, 'Only the patient can initiate payment for this consultation');
    }

    const doctor = await db('doctors').where({ id: consultation.doctor_id }).first();
    const amount = Number(doctor?.consultation_fee) || 500.0;

    // Check existing payment records for this consultation
    const existingPayment = await db('payments')
      .where({ consultation_id })
      .orderBy('created_at', 'desc')
      .first();

    if (existingPayment && existingPayment.status === 'completed') {
      return conflict(res, 'This consultation has already been paid for');
    }

    if (existingPayment && existingPayment.status === 'pending') {
      return ok(
        res,
        {
          payment: existingPayment,
          transaction_id: existingPayment.transaction_id,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        'Existing active payment order retrieved'
      );
    }

    // Generate unique transaction reference
    const transaction_id = `ORDER-${Date.now()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const [payment] = await db('payments')
      .insert({
        consultation_id,
        patient_id: req.user.id,
        amount,
        currency: 'INR',
        status: 'pending',
        payment_method,
        transaction_id,
      })
      .returning('*');

    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'PAYMENT_INITIATED',
      entity_type: 'payments',
      entity_id: payment.id,
      ip_address: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers['user-agent'],
      details: JSON.stringify({ consultation_id, amount, transaction_id }),
    });

    return created(
      res,
      {
        payment,
        transaction_id,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      'Payment order created successfully'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Handle payment gateway webhook (Idempotent + Saga Compensating Action)
 * POST /api/v1/payments/webhook
 */
export async function handlePaymentWebhook(req, res, next) {
  try {
    const { event, transaction_id } = req.body;

    try {
      const result = await db.transaction(async (trx) => {
        // 1. Pessimistic lock on payment record
        const payment = await trx('payments')
          .where({ transaction_id })
          .forUpdate()
          .first();

        if (!payment) {
          const err = new Error('Payment transaction not found');
          err.statusCode = 404;
          throw err;
        }

        // 2. Idempotency guard: duplicate delivery
        if (payment.status === 'completed' && event === 'payment.success') {
          return {
            payment,
            idempotent: true,
            message: 'Payment already processed (idempotent duplicate)',
          };
        }

        if (payment.status === 'failed' && event === 'payment.failed') {
          return {
            payment,
            idempotent: true,
            message: 'Payment already marked failed (idempotent duplicate)',
          };
        }

        const consultation = await trx('consultations')
          .where({ id: payment.consultation_id })
          .first();

        // 3. Branch A: Payment Success
        if (event === 'payment.success') {
          const [updatedPayment] = await trx('payments')
            .where({ id: payment.id })
            .update({
              status: 'completed',
              updated_at: db.fn.now(),
            })
            .returning('*');

          if (consultation && consultation.status !== 'completed') {
            await trx('consultations')
              .where({ id: consultation.id })
              .update({
                status: 'scheduled',
                updated_at: db.fn.now(),
              });

            await trx('availability_slots')
              .where({ id: consultation.slot_id })
              .update({
                status: 'booked',
                updated_at: db.fn.now(),
              });
          }

          await trx('audit_logs').insert({
            user_id: payment.patient_id,
            action: 'PAYMENT_COMPLETED',
            entity_type: 'payments',
            entity_id: payment.id,
            ip_address: req.ip || req.socket?.remoteAddress,
            user_agent: req.headers['user-agent'],
            details: JSON.stringify({ transaction_id, amount: payment.amount }),
          });

          return {
            payment: updatedPayment,
            status: 'completed',
            message: 'Payment confirmed successfully',
          };
        }

        // 4. Branch B: Payment Failed -> SAGA COMPENSATING ACTION
        if (event === 'payment.failed') {
          const [failedPayment] = await trx('payments')
            .where({ id: payment.id })
            .update({
              status: 'failed',
              updated_at: db.fn.now(),
            })
            .returning('*');

          // SAGA COMPENSATING ACTIONS:
          // 1. Mark consultation as cancelled
          // 2. Unlock slot and restore to 'available'
          if (consultation) {
            await trx('consultations')
              .where({ id: consultation.id })
              .update({
                status: 'cancelled',
                notes: `${consultation.notes ? consultation.notes + ' | ' : ''}Cancelled automatically due to payment failure`,
                updated_at: db.fn.now(),
              });

            await trx('availability_slots')
              .where({ id: consultation.slot_id })
              .update({
                status: 'available',
                updated_at: db.fn.now(),
              });
          }

          await trx('audit_logs').insert({
            user_id: payment.patient_id,
            action: 'PAYMENT_FAILED_SAGA_COMPENSATION',
            entity_type: 'payments',
            entity_id: payment.id,
            ip_address: req.ip || req.socket?.remoteAddress,
            user_agent: req.headers['user-agent'],
            details: JSON.stringify({
              transaction_id,
              consultation_id: payment.consultation_id,
              slot_id: consultation?.slot_id,
            }),
          });

          return {
            payment: failedPayment,
            status: 'failed',
            saga_compensation: 'Consultation cancelled and availability slot restored to available',
            message: 'Payment failure processed and compensating actions executed',
          };
        }
      });

      if (result && result.status === 'completed' && result.payment) {
        queueInvoiceGeneration({
          paymentId: result.payment.id,
          consultationId: result.payment.consultation_id,
          amount: result.payment.amount,
          currency: result.payment.currency,
        }).catch((err) => console.warn('[AsyncQueue] Invoice queue error:', err.message));
      }

      return ok(res, result, result.message);
    } catch (txErr) {
      if (txErr.statusCode === 404) return notFound(res, txErr.message);
      throw txErr;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Process a refund for a completed payment
 * POST /api/v1/payments/:id/refund
 */
export async function processRefund(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    try {
      const result = await db.transaction(async (trx) => {
        const payment = await trx('payments').where({ id }).forUpdate().first();
        if (!payment) {
          const err = new Error('Payment record not found');
          err.statusCode = 404;
          throw err;
        }

        const consultation = await trx('consultations')
          .where({ id: payment.consultation_id })
          .first();

        // Check ownership
        const isPatient = payment.patient_id === req.user.id;
        const doctor = await trx('doctors')
          .where({ id: consultation?.doctor_id, user_id: req.user.id })
          .first();
        const isAdmin = req.user.role === 'admin';

        if (!isPatient && !doctor && !isAdmin) {
          const err = new Error('You do not have permission to refund this payment');
          err.statusCode = 403;
          throw err;
        }

        // Validate status
        if (payment.status !== 'completed') {
          const err = new Error(
            `Cannot refund payment with status '${payment.status}'. Only 'completed' payments can be refunded.`
          );
          err.isConflict = true;
          throw err;
        }

        // Update payment to refunded
        const [refundedPayment] = await trx('payments')
          .where({ id })
          .update({
            status: 'refunded',
            updated_at: db.fn.now(),
          })
          .returning('*');

        // Compensating action: cancel consultation & restore slot if scheduled
        if (consultation && (consultation.status === 'scheduled' || consultation.status === 'in_progress')) {
          await trx('consultations')
            .where({ id: consultation.id })
            .update({
              status: 'cancelled',
              notes: `${consultation.notes ? consultation.notes + ' | ' : ''}Refunded: ${reason || 'Customer refund requested'}`,
              updated_at: db.fn.now(),
            });

          await trx('availability_slots')
            .where({ id: consultation.slot_id })
            .update({
              status: 'available',
              updated_at: db.fn.now(),
            });
        }

        const refundTransactionId = `REFUND-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        await trx('audit_logs').insert({
          user_id: req.user.id,
          action: 'PAYMENT_REFUNDED',
          entity_type: 'payments',
          entity_id: id,
          ip_address: req.ip || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent'],
          details: JSON.stringify({
            amount: payment.amount,
            refundTransactionId,
            reason,
          }),
        });

        return {
          payment: refundedPayment,
          refund_transaction_id: refundTransactionId,
          refunded_amount: payment.amount,
        };
      });

      return ok(
        res,
        result,
        'Payment refunded successfully and slot schedule restored'
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
 * Get payment details by payment ID
 * GET /api/v1/payments/:id
 */
export async function getPaymentById(req, res, next) {
  try {
    const { id } = req.params;

    const payment = await db('payments')
      .join('consultations', 'payments.consultation_id', 'consultations.id')
      .join('doctors', 'consultations.doctor_id', 'doctors.id')
      .join('users as doc_user', 'doctors.user_id', 'doc_user.id')
      .join('profiles as doc_profile', 'doc_user.id', 'doc_profile.user_id')
      .join('users as pat_user', 'payments.patient_id', 'pat_user.id')
      .join('profiles as pat_profile', 'pat_user.id', 'pat_profile.user_id')
      .where('payments.id', id)
      .select(
        'payments.id',
        'payments.consultation_id',
        'payments.amount',
        'payments.currency',
        'payments.status',
        'payments.payment_method',
        'payments.transaction_id',
        'payments.created_at',
        'payments.updated_at',
        'doctors.specialization',
        'doc_profile.first_name as doctor_first_name',
        'doc_profile.last_name as doctor_last_name',
        'pat_user.id as patient_id',
        'pat_profile.first_name as patient_first_name',
        'pat_profile.last_name as patient_last_name'
      )
      .first();

    if (!payment) {
      return notFound(res, 'Payment record not found');
    }

    // Ownership check
    const isPatient = payment.patient_id === req.user.id;
    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    const isDoctor = doctor && payment.doctor_id === doctor.id;
    const isAdmin = req.user.role === 'admin';

    if (!isPatient && !isDoctor && !isAdmin) {
      return forbidden(res, 'You do not have permission to view this payment ledger');
    }

    return ok(res, payment, 'Payment record retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * List payment transaction history for authenticated user
 * GET /api/v1/payments/my-payments
 */
export async function getMyPayments(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const baseQuery = db('payments')
      .join('consultations', 'payments.consultation_id', 'consultations.id')
      .join('doctors', 'consultations.doctor_id', 'doctors.id')
      .join('users as doc_user', 'doctors.user_id', 'doc_user.id')
      .join('profiles as doc_profile', 'doc_user.id', 'doc_profile.user_id')
      .join('users as pat_user', 'payments.patient_id', 'pat_user.id')
      .join('profiles as pat_profile', 'pat_user.id', 'pat_profile.user_id');

    if (req.user.role === 'patient') {
      baseQuery.where('payments.patient_id', req.user.id);
    } else if (req.user.role === 'doctor') {
      const doctor = await db('doctors').where({ user_id: req.user.id }).first();
      if (!doctor) {
        return notFound(res, 'Doctor profile not found');
      }
      baseQuery.where('consultations.doctor_id', doctor.id);
    }

    if (status) {
      baseQuery.where('payments.status', status);
    }

    const [{ count }] = await baseQuery.clone().count('payments.id as count');
    const total = parseInt(count, 10);

    const payments = await baseQuery
      .select(
        'payments.id',
        'payments.consultation_id',
        'payments.amount',
        'payments.currency',
        'payments.status',
        'payments.payment_method',
        'payments.transaction_id',
        'payments.created_at',
        'doctors.specialization',
        'doc_profile.first_name as doctor_first_name',
        'doc_profile.last_name as doctor_last_name',
        'pat_profile.first_name as patient_first_name',
        'pat_profile.last_name as patient_last_name'
      )
      .orderBy('payments.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    return ok(res, {
      payments,
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
