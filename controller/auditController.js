import { db } from '../db/db.js';
import { ok, notFound, forbidden } from '../helper/apiResponse.js';
import { formatUtcDate } from '../helper/date.js';

/**
 * List audit logs with multi-dimensional filtering and pagination
 * Restricted to role: admin
 * GET /api/v1/admin/audit-logs
 */
export async function listAuditLogs(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return forbidden(res, 'Only administrators can access compliance audit trails.');
    }

    const {
      action,
      entity_type,
      entity_id,
      user_id,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const baseQuery = db('audit_logs')
      .leftJoin('users', 'audit_logs.user_id', 'users.id')
      .leftJoin('profiles', 'users.id', 'profiles.user_id');

    if (action) {
      baseQuery.whereILike('audit_logs.action', `%${action.trim()}%`);
    }

    if (entity_type) {
      baseQuery.where('audit_logs.entity_type', entity_type.trim());
    }

    if (entity_id) {
      baseQuery.where('audit_logs.entity_id', entity_id.trim());
    }

    if (user_id) {
      baseQuery.where('audit_logs.user_id', user_id.trim());
    }

    if (startDate) {
      baseQuery.where('audit_logs.created_at', '>=', `${startDate} 00:00:00+00`);
    }

    if (endDate) {
      baseQuery.where('audit_logs.created_at', '<=', `${endDate} 23:59:59+00`);
    }

    // Count total matching records
    const [{ count }] = await baseQuery.clone().count('audit_logs.id as count');
    const total = parseInt(count, 10);

    // Fetch paginated results
    const rawLogs = await baseQuery
      .select(
        'audit_logs.id',
        'audit_logs.action',
        'audit_logs.entity_type',
        'audit_logs.entity_id',
        'audit_logs.ip_address',
        'audit_logs.user_agent',
        'audit_logs.details',
        'audit_logs.created_at',
        'users.id as actor_user_id',
        'users.email as actor_email',
        'users.role as actor_role',
        'profiles.first_name as actor_first_name',
        'profiles.last_name as actor_last_name'
      )
      .orderBy('audit_logs.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    const logs = rawLogs.map((log) => {
      let details = log.details;
      if (typeof details === 'string') {
        try {
          details = JSON.parse(details);
        } catch {
          // Keep raw string if not JSON
        }
      }

      return {
        id: log.id,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        details,
        created_at: formatUtcDate(log.created_at),
        actor: log.actor_user_id
          ? {
              id: log.actor_user_id,
              email: log.actor_email,
              role: log.actor_role,
              name: `${log.actor_first_name || ''} ${log.actor_last_name || ''}`.trim() || null,
            }
          : null,
      };
    });

    return ok(
      res,
      {
        logs,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
      'Audit logs retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Compliance summary & security telemetry
 * GET /api/v1/admin/audit-logs/summary
 */
export async function getAuditLogSummary(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return forbidden(res, 'Only administrators can access compliance audit trails.');
    }

    // 1. Total lifetime events
    const [{ total }] = await db('audit_logs').count('id as total');

    // 2. Events in the last 24 hours UTC
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ recent }] = await db('audit_logs')
      .where('created_at', '>=', twentyFourHoursAgo)
      .count('id as recent');

    // 3. Breakdown by action
    const actionBreakdown = await db('audit_logs')
      .select('action')
      .count('id as count')
      .groupBy('action')
      .orderBy('count', 'desc');

    // 4. Breakdown by entity_type
    const entityBreakdown = await db('audit_logs')
      .select('entity_type')
      .count('id as count')
      .groupBy('entity_type')
      .orderBy('count', 'desc');

    // 5. Top 5 active actors
    const topActors = await db('audit_logs')
      .join('users', 'audit_logs.user_id', 'users.id')
      .leftJoin('profiles', 'users.id', 'profiles.user_id')
      .select(
        'users.id',
        'users.email',
        'users.role',
        'profiles.first_name',
        'profiles.last_name'
      )
      .count('audit_logs.id as event_count')
      .groupBy(
        'users.id',
        'users.email',
        'users.role',
        'profiles.first_name',
        'profiles.last_name'
      )
      .orderBy('event_count', 'desc')
      .limit(5);

    const formattedActors = topActors.map((actor) => ({
      id: actor.id,
      email: actor.email,
      role: actor.role,
      name: `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || null,
      event_count: parseInt(actor.event_count, 10),
    }));

    return ok(
      res,
      {
        total_events: parseInt(total, 10),
        events_last_24h: parseInt(recent, 10),
        action_breakdown: actionBreakdown.map((a) => ({
          action: a.action,
          count: parseInt(a.count, 10),
        })),
        entity_breakdown: entityBreakdown.map((e) => ({
          entity_type: e.entity_type,
          count: parseInt(e.count, 10),
        })),
        top_actors: formattedActors,
      },
      'Audit log summary retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve single audit log details by UUID
 * GET /api/v1/admin/audit-logs/:id
 */
export async function getAuditLogById(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return forbidden(res, 'Only administrators can access compliance audit trails.');
    }

    const { id } = req.params;

    const log = await db('audit_logs')
      .leftJoin('users', 'audit_logs.user_id', 'users.id')
      .leftJoin('profiles', 'users.id', 'profiles.user_id')
      .where('audit_logs.id', id)
      .select(
        'audit_logs.id',
        'audit_logs.action',
        'audit_logs.entity_type',
        'audit_logs.entity_id',
        'audit_logs.ip_address',
        'audit_logs.user_agent',
        'audit_logs.details',
        'audit_logs.created_at',
        'users.id as actor_user_id',
        'users.email as actor_email',
        'users.role as actor_role',
        'profiles.first_name as actor_first_name',
        'profiles.last_name as actor_last_name'
      )
      .first();

    if (!log) {
      return notFound(res, 'Audit log entry not found');
    }

    let details = log.details;
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch {
        // Keep as string
      }
    }

    return ok(
      res,
      {
        id: log.id,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        details,
        created_at: formatUtcDate(log.created_at),
        actor: log.actor_user_id
          ? {
              id: log.actor_user_id,
              email: log.actor_email,
              role: log.actor_role,
              name: `${log.actor_first_name || ''} ${log.actor_last_name || ''}`.trim() || null,
            }
          : null,
      },
      'Audit log details retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
}
