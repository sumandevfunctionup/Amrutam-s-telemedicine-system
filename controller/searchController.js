import { db } from '../db/db.js';
import { ok, badRequest, notFound } from '../helper/apiResponse.js';
import { formatUtcDate } from '../helper/date.js';
import { cacheGet, cacheSet } from '../helper/redis.js';

/**
 * Multi-dimensional Doctor Search Engine
 * Sub-200ms target SLA with composite filters & Redis caching
 * GET /api/v1/search/doctors
 */
export async function searchDoctors(req, res, next) {
  const startTime = Date.now();
  try {
    const {
      q,
      specialization,
      minFee,
      maxFee,
      minExperience,
      minRating,
      gender,
      availableDate,
      sortBy = 'rating',
      page = 1,
      limit = 10,
    } = req.query;

    const cacheKey = `amrutam:search:doctors:${JSON.stringify(req.query)}`;

    // 1. Fast Redis Cache Check (< 15ms)
    const cachedResult = await cacheGet(cacheKey);
    if (cachedResult) {
      const responseTime = Date.now() - startTime;
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      res.setHeader('X-Response-Time-Ms', responseTime);
      return ok(res, cachedResult, 'Doctors retrieved successfully (from Redis cache)');
    }

    // 2. Build Base Query joining doctors, users, profiles
    let query = db('doctors')
      .join('users', 'doctors.user_id', 'users.id')
      .join('profiles', 'users.id', 'profiles.user_id')
      .where('users.status', 'active')
      .where('doctors.is_verified', true);

    // Filter: Free text search across name, specialization, and bio
    if (q) {
      const term = `%${q.trim()}%`;
      query = query.where((builder) => {
        builder
          .whereILike('profiles.first_name', term)
          .orWhereILike('profiles.last_name', term)
          .orWhereILike('doctors.specialization', term)
          .orWhereILike('doctors.bio', term);
      });
    }

    // Filter: Specialization
    if (specialization) {
      query = query.whereILike('doctors.specialization', `%${specialization.trim()}%`);
    }

    // Filter: Numeric ranges
    if (minFee !== undefined) {
      query = query.where('doctors.consultation_fee', '>=', Number(minFee));
    }
    if (maxFee !== undefined) {
      query = query.where('doctors.consultation_fee', '<=', Number(maxFee));
    }
    if (minExperience !== undefined) {
      query = query.where('doctors.experience_years', '>=', Number(minExperience));
    }
    if (minRating !== undefined) {
      query = query.where('doctors.rating', '>=', Number(minRating));
    }

    // Filter: Gender
    if (gender) {
      query = query.where('profiles.gender', gender);
    }

    // Filter: Doctors with available slots on a specific date
    if (availableDate) {
      const dayStart = `${availableDate} 00:00:00+00`;
      const dayEnd = `${availableDate} 23:59:59+00`;

      query = query.whereExists(
        db('availability_slots')
          .whereRaw('availability_slots.doctor_id = doctors.id')
          .where('availability_slots.status', 'available')
          .where('availability_slots.start_time', '>=', dayStart)
          .where('availability_slots.start_time', '<=', dayEnd)
      );
    }

    // Count total matching records for pagination
    const [{ count }] = await query.clone().count('doctors.id as count');
    const total = parseInt(count, 10);

    // Sorting
    switch (sortBy) {
      case 'fee_asc':
        query = query.orderBy('doctors.consultation_fee', 'asc');
        break;
      case 'fee_desc':
        query = query.orderBy('doctors.consultation_fee', 'desc');
        break;
      case 'experience':
        query = query.orderBy('doctors.experience_years', 'desc');
        break;
      case 'name':
        query = query.orderBy('profiles.first_name', 'asc');
        break;
      case 'rating':
      default:
        query = query.orderBy('doctors.rating', 'desc').orderBy('doctors.total_reviews', 'desc');
        break;
    }

    // Pagination
    const offset = (page - 1) * limit;
    const rawDoctors = await query
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
        'doctors.created_at'
      )
      .offset(offset)
      .limit(limit);

    // 3. Batch next-available-slot calculation for returned doctors
    const doctorIds = rawDoctors.map((d) => d.id);
    let nextSlotsMap = {};

    if (doctorIds.length > 0) {
      const nowUtc = new Date().toISOString();
      const slots = await db('availability_slots')
        .whereIn('doctor_id', doctorIds)
        .where('status', 'available')
        .where('start_time', '>', nowUtc)
        .orderBy('start_time', 'asc');

      // Group earliest slot per doctor
      for (const slot of slots) {
        if (!nextSlotsMap[slot.doctor_id]) {
          nextSlotsMap[slot.doctor_id] = {
            id: slot.id,
            start_time: formatUtcDate(slot.start_time),
            end_time: formatUtcDate(slot.end_time),
          };
        }
      }
    }

    // Format doctor responses
    const doctors = rawDoctors.map((doc) => ({
      id: doc.id,
      user_id: doc.user_id,
      name: `Dr. ${doc.first_name} ${doc.last_name}`,
      email: doc.email,
      gender: doc.gender,
      avatar_url: doc.avatar_url,
      specialization: doc.specialization,
      license_number: doc.license_number,
      experience_years: doc.experience_years,
      consultation_fee: Number(doc.consultation_fee),
      rating: Number(doc.rating),
      total_reviews: doc.total_reviews,
      bio: doc.bio,
      is_verified: doc.is_verified,
      created_at: formatUtcDate(doc.created_at),
      next_available_slot: nextSlotsMap[doc.id] || null,
    }));

    const responsePayload = {
      doctors,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit) || 1,
      },
    };

    // Store in Redis (2-minute TTL for search queries)
    await cacheSet(cacheKey, responsePayload, 120);

    const responseTime = Date.now() - startTime;
    res.setHeader('X-Cache-Lookup', 'MISS');
    res.setHeader('X-Response-Time-Ms', responseTime);

    return ok(res, responsePayload, 'Doctors retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Get Ayurvedic Specialization Categories & Aggregates
 * GET /api/v1/search/specializations
 */
export async function getSpecializations(req, res, next) {
  try {
    const cacheKey = 'amrutam:search:specializations';

    // Fast Redis check (15-minute TTL)
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      return ok(res, cached, 'Specializations retrieved successfully (from Redis cache)');
    }

    const specializations = await db('doctors')
      .join('users', 'doctors.user_id', 'users.id')
      .where('users.status', 'active')
      .where('doctors.is_verified', true)
      .groupBy('doctors.specialization')
      .select(
        'doctors.specialization',
        db.raw('COUNT(doctors.id)::integer as doctor_count'),
        db.raw('ROUND(AVG(doctors.consultation_fee), 2)::float as avg_fee'),
        db.raw('MIN(doctors.consultation_fee)::float as min_fee'),
        db.raw('MAX(doctors.consultation_fee)::float as max_fee'),
        db.raw('ROUND(AVG(doctors.rating), 2)::float as avg_rating')
      )
      .orderBy('doctor_count', 'desc');

    // Cache in Redis for 15 minutes
    await cacheSet(cacheKey, { specializations }, 900);

    res.setHeader('X-Cache-Lookup', 'MISS');
    return ok(res, { specializations }, 'Specializations retrieved successfully');
  } catch (error) {
    next(error);
  }
}
