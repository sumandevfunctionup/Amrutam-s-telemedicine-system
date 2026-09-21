import { db } from '../db/db.js';
import { ok, forbidden } from '../helper/apiResponse.js';
import { formatUtcDate, getCurrentUtcDateTime } from '../helper/date.js';
import { cacheGet, cacheSet } from '../helper/redis.js';

/**
 * Executive KPI Overview Dashboard
 * GET /api/v1/admin/analytics/overview
 */
export async function getOverviewKpis(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return forbidden(res, 'Only administrators can access analytics dashboards.');
    }

    const cacheKey = 'amrutam:analytics:overview';
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      return ok(res, cached, 'Analytics overview retrieved successfully (from Redis cache)');
    }

    // 1. Consultations today (UTC)
    const [{ count: todayCount }] = await db('consultations')
      .where('created_at', '>=', db.raw("CURRENT_DATE AT TIME ZONE 'UTC'"))
      .count('id as count');

    // 2. Lifetime consultations count and status breakdown
    const [{ count: totalConsultations }] = await db('consultations').count('id as count');

    const statusCounts = await db('consultations')
      .select('status')
      .count('id as count')
      .groupBy('status');

    const statusMap = statusCounts.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});

    const completed = statusMap['completed'] || 0;
    const cancelled = statusMap['cancelled'] || 0;
    const scheduled = statusMap['scheduled'] || 0;
    const totalCount = parseInt(totalConsultations, 10) || 1;

    const fulfillmentRate = Number(((completed / totalCount) * 100).toFixed(2));
    const cancellationRate = Number(((cancelled / totalCount) * 100).toFixed(2));

    // 3. Active users
    const [{ count: activePatients }] = await db('users')
      .where({ role: 'patient', status: 'active' })
      .count('id as count');

    const [{ count: activeDoctors }] = await db('doctors')
      .join('users', 'doctors.user_id', 'users.id')
      .where('users.status', 'active')
      .count('doctors.id as count');

    // 4. Financial revenue metrics
    const [grossRow] = await db('payments')
      .where({ status: 'completed' })
      .sum('amount as gross')
      .count('id as count');

    const [refundRow] = await db('payments')
      .where({ status: 'refunded' })
      .sum('amount as refunds')
      .count('id as count');

    const grossRevenue = Number(grossRow?.gross || 0);
    const totalRefunds = Number(refundRow?.refunds || 0);
    const netRevenue = Number((grossRevenue - totalRefunds).toFixed(2));

    // 5. Daily Capacity 100k Target Metric
    const consultationsToday = parseInt(todayCount, 10);
    const capacityTargetDaily = 100000;
    const capacityPercentage = `${((consultationsToday / capacityTargetDaily) * 100).toFixed(4)}%`;

    const overviewData = {
      timestamp: getCurrentUtcDateTime(),
      consultations: {
        today: consultationsToday,
        target_daily_capacity: capacityTargetDaily,
        capacity_fulfillment_progress: capacityPercentage,
        total_lifetime: parseInt(totalConsultations, 10),
        status_breakdown: {
          scheduled,
          completed,
          cancelled,
          in_progress: statusMap['in_progress'] || 0,
          no_show: statusMap['no_show'] || 0,
        },
        fulfillment_rate_percentage: fulfillmentRate,
        cancellation_rate_percentage: cancellationRate,
      },
      users: {
        active_patients: parseInt(activePatients, 10),
        active_doctors: parseInt(activeDoctors, 10),
      },
      financials: {
        currency: 'INR',
        gross_revenue: grossRevenue,
        completed_transactions: parseInt(grossRow?.count || 0, 10),
        total_refunds: totalRefunds,
        refunded_transactions: parseInt(refundRow?.count || 0, 10),
        net_revenue: netRevenue,
      },
    };

    // Cache in Redis for 5 minutes
    await cacheSet(cacheKey, overviewData, 300);

    res.setHeader('X-Cache-Lookup', 'MISS');
    return ok(res, overviewData, 'Analytics overview retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Consultation Timeseries Breakdown
 * GET /api/v1/admin/analytics/consultations
 */
export async function getConsultationTimeseries(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return forbidden(res, 'Only administrators can access analytics dashboards.');
    }

    const { startDate, endDate, groupBy = 'day' } = req.query;

    const cacheKey = `amrutam:analytics:consultations:${JSON.stringify(req.query)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      return ok(res, cached, 'Consultation timeseries retrieved successfully (from Redis cache)');
    }

    let dateTrunc = 'day';
    if (groupBy === 'week') dateTrunc = 'week';
    if (groupBy === 'month') dateTrunc = 'month';

    const baseQuery = db('consultations');

    if (startDate) {
      baseQuery.where('created_at', '>=', `${startDate} 00:00:00+00`);
    } else {
      // Default: last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      baseQuery.where('created_at', '>=', thirtyDaysAgo);
    }

    if (endDate) {
      baseQuery.where('created_at', '<=', `${endDate} 23:59:59+00`);
    }

    const rawTimeseries = await baseQuery
      .select(
        db.raw(`TO_CHAR(DATE_TRUNC('${dateTrunc}', created_at), 'YYYY-MM-DD') as period`),
        db.raw('COUNT(id)::int as total'),
        db.raw("COUNT(id) FILTER (WHERE status = 'completed')::int as completed"),
        db.raw("COUNT(id) FILTER (WHERE status = 'scheduled')::int as scheduled"),
        db.raw("COUNT(id) FILTER (WHERE status = 'cancelled')::int as cancelled"),
        db.raw("COUNT(id) FILTER (WHERE status = 'in_progress')::int as in_progress"),
        db.raw("COUNT(id) FILTER (WHERE status = 'no_show')::int as no_show")
      )
      .groupBy('period')
      .orderBy('period', 'asc');

    const result = {
      groupBy,
      startDate: startDate || null,
      endDate: endDate || null,
      timeseries: rawTimeseries,
    };

    // Cache in Redis for 5 minutes
    await cacheSet(cacheKey, result, 300);

    res.setHeader('X-Cache-Lookup', 'MISS');
    return ok(res, result, 'Consultation timeseries retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Financial & Revenue Performance Intelligence
 * GET /api/v1/admin/analytics/revenue
 */
export async function getRevenuePerformance(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return forbidden(res, 'Only administrators can access analytics dashboards.');
    }

    const { startDate, endDate } = req.query;

    const cacheKey = `amrutam:analytics:revenue:${JSON.stringify(req.query)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      return ok(res, cached, 'Revenue performance retrieved successfully (from Redis cache)');
    }

    let paymentQuery = db('payments');
    if (startDate) {
      paymentQuery = paymentQuery.where('created_at', '>=', `${startDate} 00:00:00+00`);
    }
    if (endDate) {
      paymentQuery = paymentQuery.where('created_at', '<=', `${endDate} 23:59:59+00`);
    }

    // 1. Overall Revenue
    const [totals] = await paymentQuery.clone().select(
      db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0)::float as gross_revenue"),
      db.raw("COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::float as total_refunds"),
      db.raw("COUNT(id) FILTER (WHERE status = 'completed')::int as successful_payments"),
      db.raw("COUNT(id) FILTER (WHERE status = 'failed')::int as failed_payments"),
      db.raw("COUNT(id) FILTER (WHERE status = 'refunded')::int as refund_count")
    );

    const gross = Number(totals.gross_revenue) || 0;
    const refunds = Number(totals.total_refunds) || 0;
    const net = Number((gross - refunds).toFixed(2));

    // 2. Revenue by Ayurvedic Specialization
    const revenueBySpecialty = await db('payments')
      .join('consultations', 'payments.consultation_id', 'consultations.id')
      .join('doctors', 'consultations.doctor_id', 'doctors.id')
      .where('payments.status', 'completed')
      .groupBy('doctors.specialization')
      .select(
        'doctors.specialization',
        db.raw('ROUND(SUM(payments.amount), 2)::float as revenue'),
        db.raw('COUNT(payments.id)::int as transaction_count')
      )
      .orderBy('revenue', 'desc');

    // 3. Revenue by Payment Method
    const revenueByMethod = await db('payments')
      .where('status', 'completed')
      .groupBy('payment_method')
      .select(
        'payment_method',
        db.raw('ROUND(SUM(amount), 2)::float as total_volume'),
        db.raw('COUNT(id)::int as count')
      )
      .orderBy('total_volume', 'desc');

    const result = {
      summary: {
        currency: 'INR',
        gross_revenue: gross,
        total_refunds: refunds,
        net_revenue: net,
        successful_payments: totals.successful_payments,
        failed_payments: totals.failed_payments,
        refund_count: totals.refund_count,
      },
      revenue_by_specialization: revenueBySpecialty,
      payment_methods: revenueByMethod,
    };

    // Cache in Redis for 5 minutes
    await cacheSet(cacheKey, result, 300);

    res.setHeader('X-Cache-Lookup', 'MISS');
    return ok(res, result, 'Revenue performance retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Doctor Utilization & Capacity Intelligence
 * GET /api/v1/admin/analytics/doctors
 */
export async function getDoctorUtilization(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return forbidden(res, 'Only administrators can access analytics dashboards.');
    }

    const cacheKey = 'amrutam:analytics:doctors';
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.setHeader('X-Cache-Lookup', 'HIT-REDIS');
      return ok(res, cached, 'Doctor utilization retrieved successfully (from Redis cache)');
    }

    // 1. Slot Status Breakdown
    const slotStats = await db('availability_slots')
      .select('status')
      .count('id as count')
      .groupBy('status');

    const slotMap = slotStats.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});

    const totalSlots =
      (slotMap['available'] || 0) +
      (slotMap['booked'] || 0) +
      (slotMap['locked'] || 0);

    const bookedSlots = slotMap['booked'] || 0;
    const utilizationRate =
      totalSlots > 0 ? Number(((bookedSlots / totalSlots) * 100).toFixed(2)) : 0;

    // 2. Top Performing Doctors Ranking
    const topDoctors = await db('doctors')
      .join('users', 'doctors.user_id', 'users.id')
      .join('profiles', 'users.id', 'profiles.user_id')
      .leftJoin('consultations', function () {
        this.on('doctors.id', '=', 'consultations.doctor_id').andOn(
          'consultations.status',
          '=',
          db.raw("'completed'")
        );
      })
      .where('users.status', 'active')
      .groupBy(
        'doctors.id',
        'profiles.first_name',
        'profiles.last_name',
        'doctors.specialization',
        'doctors.consultation_fee',
        'doctors.rating',
        'doctors.total_reviews'
      )
      .select(
        'doctors.id',
        db.raw("CONCAT('Dr. ', profiles.first_name, ' ', profiles.last_name) as doctor_name"),
        'doctors.specialization',
        db.raw('doctors.consultation_fee::float as consultation_fee'),
        db.raw('doctors.rating::float as rating'),
        'doctors.total_reviews',
        db.raw('COUNT(consultations.id)::int as completed_consultations')
      )
      .orderBy('completed_consultations', 'desc')
      .orderBy('rating', 'desc')
      .limit(10);

    const result = {
      capacity_metrics: {
        total_active_slots: totalSlots,
        booked_slots: bookedSlots,
        available_slots: slotMap['available'] || 0,
        locked_slots: slotMap['locked'] || 0,
        cancelled_slots: slotMap['cancelled'] || 0,
        platform_utilization_rate_percentage: utilizationRate,
      },
      top_performing_doctors: topDoctors,
    };

    // Cache in Redis for 5 minutes
    await cacheSet(cacheKey, result, 300);

    res.setHeader('X-Cache-Lookup', 'MISS');
    return ok(res, result, 'Doctor utilization retrieved successfully');
  } catch (error) {
    next(error);
  }
}
