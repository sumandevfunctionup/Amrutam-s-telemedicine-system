/**
 * Asynchronous Background Job Queue & Task Processor
 * Decoupled background task execution for heavy operations:
 * - Consultation Confirmation & SMS/Email Dispatch
 * - Digital Invoice Preparation
 * - Expired Slot Hold Sweeping & Recovery
 * 
 * Supports Redis job state persistence and automatic exponential retries.
 */

import { randomUUID } from 'crypto';
import { getUTCDateTime } from './date.js';
import { getRedisClient } from './redis.js';
import { withRetry } from './retry.js';
import { db } from '../db/db.js';

export const JOB_TYPES = {
  SEND_CONSULTATION_CONFIRMATION: 'SEND_CONSULTATION_CONFIRMATION',
  GENERATE_INVOICE: 'GENERATE_INVOICE',
  CLEANUP_EXPIRED_HOLDS: 'CLEANUP_EXPIRED_HOLDS',
};

class AsyncJobQueue {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.activeWorkers = 0;
    this.queue = [];
    this.inMemoryJobs = new Map();
    this.handlers = new Map();

    this._registerDefaultHandlers();
  }

  /**
   * Register job handlers for specific task types
   */
  _registerDefaultHandlers() {
    // 1. Consultation Confirmation Notification Handler
    this.registerHandler(JOB_TYPES.SEND_CONSULTATION_CONFIRMATION, async (payload) => {
      const { consultationId, patientEmail, doctorName, scheduledAt } = payload;
      // Simulate real-world external communication dispatch (Email / SMS / WhatsApp Gateway)
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        dispatched: true,
        channel: 'email_and_sms',
        consultationId,
        recipient: patientEmail,
        timestamp: getUTCDateTime(),
      };
    });

    // 2. Invoice Generation Handler
    this.registerHandler(JOB_TYPES.GENERATE_INVOICE, async (payload) => {
      const { paymentId, consultationId, amount, currency } = payload;
      // Simulate asynchronous document generation & tax calculation
      await new Promise((resolve) => setTimeout(resolve, 100));
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
      return {
        invoiceNumber,
        paymentId,
        consultationId,
        subtotal: amount,
        tax: Number((amount * 0.18).toFixed(2)),
        total: Number((amount * 1.18).toFixed(2)),
        currency: currency || 'INR',
        generatedAt: getUTCDateTime(),
      };
    });

    // 3. Expired Slot Hold Recovery Handler
    this.registerHandler(JOB_TYPES.CLEANUP_EXPIRED_HOLDS, async () => {
      const now = getUTCDateTime();
      const updated = await db('availability_slots')
        .where('slot_status', 'pending_payment')
        .andWhere('hold_expires_at', '<', now)
        .update({
          slot_status: 'available',
          hold_expires_at: null,
          version: db.raw('version + 1'),
          updated_at: now,
        });

      return {
        recoveredSlots: updated,
        scannedAt: now,
      };
    });
  }

  /**
   * Register a custom worker handler for a job type
   */
  registerHandler(type, handler) {
    this.handlers.set(type, handler);
  }

  /**
   * Enqueue a new background job
   * @param {string} type - Job type from JOB_TYPES
   * @param {Object} payload - Task parameters
   * @param {Object} [options] - Additional task options
   * @returns {Promise<{ jobId: string, status: string, enqueuedAt: string }>}
   */
  async enqueue(type, payload = {}, options = {}) {
    const jobId = options.jobId || `job_${randomUUID()}`;
    const enqueuedAt = getUTCDateTime();

    const job = {
      id: jobId,
      type,
      payload,
      status: 'queued',
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      enqueuedAt,
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
    };

    // Store in memory & Redis
    this.inMemoryJobs.set(jobId, job);
    await this._syncStateToRedis(job);

    this.queue.push(job);
    this._processNext();

    return {
      jobId,
      status: 'queued',
      enqueuedAt,
    };
  }

  /**
   * Drain and execute queue up to concurrency limit
   */
  async _processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeWorkers++;
    job.status = 'running';
    job.startedAt = getUTCDateTime();
    await this._syncStateToRedis(job);

    // Run job in background
    (async () => {
      const handler = this.handlers.get(job.type);
      try {
        if (!handler) {
          throw new Error(`No handler registered for job type: ${job.type}`);
        }

        const result = await withRetry(
          async () => {
            job.attempts++;
            return await handler(job.payload);
          },
          {
            maxAttempts: job.maxAttempts,
            initialDelayMs: 250,
            maxDelayMs: 2000,
          }
        );

        job.status = 'completed';
        job.completedAt = getUTCDateTime();
        job.result = result;
      } catch (err) {
        job.status = 'failed';
        job.completedAt = getUTCDateTime();
        job.error = err.message;
        console.error(`[AsyncQueue] Job ${job.id} (${job.type}) failed:`, err.message);
      } finally {
        await this._syncStateToRedis(job);
        this.activeWorkers--;
        this._processNext();
      }
    })();
  }

  /**
   * Persist job state to Upstash Redis with 24-hour TTL
   */
  async _syncStateToRedis(job) {
    const redis = getRedisClient();
    if (!redis) return;
    try {
      const key = `amrutam:jobs:${job.id}`;
      await redis.set(key, JSON.stringify(job), { ex: 86400 });
    } catch (err) {
      // Non-blocking fallback
    }
  }

  /**
   * Retrieve job execution status
   */
  async getJob(jobId) {
    // Check in-memory first
    if (this.inMemoryJobs.has(jobId)) {
      return this.inMemoryJobs.get(jobId);
    }

    // Check Redis
    const redis = getRedisClient();
    if (redis) {
      try {
        const raw = await redis.get(`amrutam:jobs:${jobId}`);
        if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (err) {
        // ignore
      }
    }

    return null;
  }
}

// Singleton Queue Instance
export const asyncQueue = new AsyncJobQueue(5);

/**
 * Helper to dispatch consultation confirmation async job
 */
export async function queueConsultationConfirmation(consultationData) {
  return asyncQueue.enqueue(JOB_TYPES.SEND_CONSULTATION_CONFIRMATION, consultationData);
}

/**
 * Helper to dispatch invoice generation async job
 */
export async function queueInvoiceGeneration(invoiceData) {
  return asyncQueue.enqueue(JOB_TYPES.GENERATE_INVOICE, invoiceData);
}

/**
 * Helper to dispatch expired slot hold cleanup
 */
export async function queueSlotCleanup() {
  return asyncQueue.enqueue(JOB_TYPES.CLEANUP_EXPIRED_HOLDS, {});
}
