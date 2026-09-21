import { db } from '../db/db.js';
import {
  ok,
  created,
  badRequest,
  notFound,
  forbidden,
  conflict,
} from '../helper/apiResponse.js';
import { cacheGet, cacheSet, cacheDel } from '../helper/redis.js';

/**
 * List all verified doctors with filtering and pagination
 * GET /api/v1/doctors
 */
export async function listDoctors(req, res, next) {
  try {
    const { specialization, minExperience, maxFee, page = 1, limit = 20 } = req.query;

    const cacheKey = `amrutam:doctors:list:${JSON.stringify(req.query)}`;
    const cachedData = await cacheGet(cacheKey);
    if (cachedData) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      return ok(res, cachedData, 'Doctors retrieved successfully (from cache)');
    }

    const baseQuery = db('doctors')
      .join('users', 'doctors.user_id', 'users.id')
      .join('profiles', 'users.id', 'profiles.user_id')
      .where('users.status', 'active');

    if (specialization) {
      baseQuery.whereILike('doctors.specialization', `%${specialization}%`);
    }

    if (minExperience !== undefined) {
      baseQuery.where('doctors.experience_years', '>=', minExperience);
    }

    if (maxFee !== undefined) {
      baseQuery.where('doctors.consultation_fee', '<=', maxFee);
    }

    const [{ count }] = await baseQuery.clone().count('doctors.id as count');
    const total = parseInt(count, 10);

    const doctors = await baseQuery
      .select(
        'doctors.id',
        'doctors.user_id',
        'profiles.first_name',
        'profiles.last_name',
        'profiles.avatar_url',
        'doctors.specialization',
        'doctors.license_number',
        'doctors.experience_years',
        'doctors.consultation_fee',
        'doctors.bio',
        'doctors.rating',
        'doctors.total_reviews',
        'doctors.is_verified',
        'doctors.created_at'
      )
      .orderBy('doctors.rating', 'desc')
      .orderBy('doctors.total_reviews', 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    const responseData = {
      doctors,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache doctor listing in Redis (5-minute TTL)
    await cacheSet(cacheKey, responseData, 300);

    return ok(res, responseData);
  } catch (error) {
    next(error);
  }
}

/**
 * Get public doctor profile by ID
 * GET /api/v1/doctors/:id
 */
export async function getDoctorProfile(req, res, next) {
  try {
    const { id } = req.params;

    // Fast Redis check (10-minute TTL)
    const cacheKey = `amrutam:doctor:profile:${id}`;
    const cachedDoctor = await cacheGet(cacheKey);
    if (cachedDoctor) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      return ok(res, cachedDoctor, 'Doctor profile retrieved successfully (from cache)');
    }

    const doctor = await db('doctors')
      .join('users', 'doctors.user_id', 'users.id')
      .join('profiles', 'users.id', 'profiles.user_id')
      .where('doctors.id', id)
      .where('users.status', 'active')
      .select(
        'doctors.id',
        'doctors.user_id',
        'users.email',
        'profiles.first_name',
        'profiles.last_name',
        'profiles.gender',
        'profiles.avatar_url',
        'doctors.specialization',
        'doctors.license_number',
        'doctors.experience_years',
        'doctors.consultation_fee',
        'doctors.bio',
        'doctors.rating',
        'doctors.total_reviews',
        'doctors.is_verified',
        'doctors.created_at',
        'doctors.updated_at'
      )
      .first();

    if (!doctor) {
      return notFound(res, 'Doctor not found');
    }

    // Cache profile in Redis
    await cacheSet(cacheKey, doctor, 600);

    return ok(res, doctor, 'Doctor profile retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Update authenticated doctor's profile
 * PUT /api/v1/doctors/profile
 */
export async function updateDoctorProfile(req, res, next) {
  try {
    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    if (!doctor) {
      return notFound(res, 'Doctor profile not found for this account');
    }

    const { specialization, experience_years, consultation_fee, bio } = req.body;
    const updatePayload = {};

    if (specialization !== undefined) updatePayload.specialization = specialization;
    if (experience_years !== undefined) updatePayload.experience_years = experience_years;
    if (consultation_fee !== undefined) updatePayload.consultation_fee = consultation_fee;
    if (bio !== undefined) updatePayload.bio = bio;

    if (Object.keys(updatePayload).length === 0) {
      return badRequest(res, 'No valid fields provided for update');
    }

    const [updated] = await db('doctors')
      .where({ id: doctor.id })
      .update({
        ...updatePayload,
        updated_at: db.fn.now(),
      })
      .returning('*');

    // Invalidate Redis caches
    await Promise.all([
      cacheDel(`amrutam:doctor:profile:${doctor.id}`),
      cacheDel('amrutam:doctors:list:*'),
      cacheDel('amrutam:search:*'),
    ]);

    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'DOCTOR_PROFILE_UPDATED',
      entity_type: 'doctors',
      entity_id: doctor.id,
      ip_address: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers['user-agent'],
      details: JSON.stringify(updatePayload),
    });

    return ok(res, updated, 'Doctor profile updated successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Batch create availability slots for authenticated doctor
 * POST /api/v1/doctors/slots
 */
export async function createAvailabilitySlots(req, res, next) {
  try {
    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    if (!doctor) {
      return notFound(res, 'Doctor profile not found for this account');
    }

    const { slots } = req.body;
    const now = new Date();

    // 1. Normalize and parse dates
    const normalizedSlots = slots.map((s) => ({
      start: new Date(s.start_time),
      end: new Date(s.end_time),
      start_iso: new Date(s.start_time).toISOString(),
      end_iso: new Date(s.end_time).toISOString(),
    }));

    // 2. Disallow slots in the past
    const pastSlot = normalizedSlots.find((s) => s.start <= now);
    if (pastSlot) {
      return badRequest(res, `Cannot create slots in the past (found: ${pastSlot.start_iso})`);
    }

    // 3. Check for internal overlaps within submitted payload
    normalizedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 0; i < normalizedSlots.length - 1; i++) {
      if (normalizedSlots[i].end > normalizedSlots[i + 1].start) {
        return badRequest(
          res,
          `Submitted slots contain internal overlaps between [${normalizedSlots[i].start_iso} - ${normalizedSlots[i].end_iso}] and [${normalizedSlots[i + 1].start_iso} - ${normalizedSlots[i + 1].end_iso}]`
        );
      }
    }

    // 4. Check for database overlaps & insert inside a transaction
    try {
      const createdSlots = await db.transaction(async (trx) => {
        const minStart = normalizedSlots[0].start_iso;
        const maxEnd = normalizedSlots[normalizedSlots.length - 1].end_iso;

        // Fetch any existing active slots that could overlap
        const existingSlots = await trx('availability_slots')
          .where('doctor_id', doctor.id)
          .whereNot('status', 'cancelled')
          .where('start_time', '<', maxEnd)
          .where('end_time', '>', minStart);

        for (const newSlot of normalizedSlots) {
          const conflicting = existingSlots.find((existing) => {
            const exStart = new Date(existing.start_time);
            const exEnd = new Date(existing.end_time);
            return exStart < newSlot.end && exEnd > newSlot.start;
          });

          if (conflicting) {
            const conflictErr = new Error(
              `Slot [${newSlot.start_iso} - ${newSlot.end_iso}] overlaps with existing slot [${conflicting.start_time.toISOString()} - ${conflicting.end_time.toISOString()}]`
            );
            conflictErr.isConflict = true;
            throw conflictErr;
          }
        }

        const insertPayload = normalizedSlots.map((s) => ({
          doctor_id: doctor.id,
          start_time: s.start_iso,
          end_time: s.end_iso,
          status: 'available',
          version: 0,
        }));

        const inserted = await trx('availability_slots').insert(insertPayload).returning('*');

        await trx('audit_logs').insert({
          user_id: req.user.id,
          action: 'AVAILABILITY_SLOTS_CREATED',
          entity_type: 'availability_slots',
          entity_id: doctor.id,
          ip_address: req.ip || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent'],
          details: JSON.stringify({ count: inserted.length, slots: insertPayload }),
        });

        return inserted;
      });

      // Invalidate slots cache & search cache
      await Promise.all([
        cacheDel(`amrutam:doctor:slots:${doctor.id}:*`),
        cacheDel('amrutam:search:*'),
      ]);

      return created(
        res,
        createdSlots,
        `${createdSlots.length} availability slot(s) created successfully`
      );
    } catch (txErr) {
      if (txErr.isConflict) {
        return conflict(res, txErr.message);
      }
      throw txErr;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Get public availability slots for a doctor with date range and status filters
 * GET /api/v1/doctors/:doctorId/slots
 */
export async function getDoctorSlots(req, res, next) {
  try {
    const { doctorId } = req.params;
    const { startDate, endDate, status = 'available' } = req.query;

    // Fast Redis check (2-minute TTL)
    const cacheKey = `amrutam:doctor:slots:${doctorId}:${JSON.stringify(req.query)}`;
    const cachedSlots = await cacheGet(cacheKey);
    if (cachedSlots) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      return ok(res, cachedSlots, 'Doctor availability slots retrieved successfully (from cache)');
    }

    const doctorExists = await db('doctors').where({ id: doctorId }).first();
    if (!doctorExists) {
      return notFound(res, 'Doctor not found');
    }

    let query = db('availability_slots').where('doctor_id', doctorId);

    if (status) {
      query = query.where('status', status);
    }

    if (startDate) {
      const parsedStart = new Date(startDate);
      if (!isNaN(parsedStart.getTime())) {
        query = query.where('start_time', '>=', parsedStart.toISOString());
      }
    }

    if (endDate) {
      const parsedEnd = new Date(endDate);
      if (!isNaN(parsedEnd.getTime())) {
        query = query.where('end_time', '<=', parsedEnd.toISOString());
      }
    }

    query = query.orderBy('start_time', 'asc');

    const slots = await query;

    // Cache slots in Redis
    await cacheSet(cacheKey, slots, 120);

    return ok(res, slots, 'Doctor availability slots retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel/Delete an available slot
 * DELETE /api/v1/doctors/slots/:slotId
 */
export async function deleteAvailabilitySlot(req, res, next) {
  try {
    const { slotId } = req.params;

    const doctor = await db('doctors').where({ user_id: req.user.id }).first();
    if (!doctor) {
      return notFound(res, 'Doctor profile not found for this account');
    }

    const slot = await db('availability_slots').where({ id: slotId }).first();
    if (!slot) {
      return notFound(res, 'Availability slot not found');
    }

    if (slot.doctor_id !== doctor.id) {
      return forbidden(res, 'You can only cancel your own availability slots');
    }

    if (slot.status !== 'available') {
      return conflict(
        res,
        `Cannot cancel slot with status '${slot.status}'. Only 'available' slots can be cancelled.`
      );
    }

    await db('availability_slots')
      .where({ id: slotId })
      .update({
        status: 'cancelled',
        updated_at: db.fn.now(),
      });

    // Invalidate slots cache
    await Promise.all([
      cacheDel(`amrutam:doctor:slots:${doctor.id}:*`),
      cacheDel('amrutam:search:*'),
    ]);

    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'SLOT_CANCELLED',
      entity_type: 'availability_slots',
      entity_id: slotId,
      ip_address: req.ip || req.socket?.remoteAddress,
      user_agent: req.headers['user-agent'],
      details: JSON.stringify({ slotId, previousStatus: slot.status }),
    });

    return ok(res, { slotId, status: 'cancelled' }, 'Availability slot cancelled successfully');
  } catch (error) {
    next(error);
  }
}
