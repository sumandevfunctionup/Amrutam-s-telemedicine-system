import { withRetry } from '../helper/retry.js';
import { asyncQueue, JOB_TYPES, queueConsultationConfirmation, queueInvoiceGeneration, queueSlotCleanup } from '../helper/asyncQueue.js';

const BASE_URL = 'http://localhost:3000';

async function runRateLimitAndAsyncTests() {
  console.log('==================================================================');
  console.log('--- TESTING RATE LIMITING, ASYNC JOBS & RETRY UTILITIES ---');
  console.log('==================================================================');

  // Test 1: Global Rate Limiting Headers
  console.log('\n[Test 1] Verifying Rate Limiting Headers on /api/v1/health');
  const resHealth = await fetch(`${BASE_URL}/api/v1/health`);
  const rlLimit = resHealth.headers.get('x-ratelimit-limit');
  const rlRemaining = resHealth.headers.get('x-ratelimit-remaining');
  const rlReset = resHealth.headers.get('x-ratelimit-reset');

  console.log(`RateLimit Headers: Limit=${rlLimit}, Remaining=${rlRemaining}, Reset=${rlReset}s`);
  if (!rlLimit) {
    throw new Error('Rate limit header X-RateLimit-Limit was not returned by API!');
  }
  console.log('SUCCESS: Rate limiting headers correctly populated!');

  // Test 2: Exponential Backoff Retry Utility
  console.log('\n[Test 2] Verifying Exponential Backoff Retry Utility (helper/retry.js)');
  let attempts = 0;
  const retryResult = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) {
        const transientErr = new Error('Simulated network timeout');
        transientErr.code = 'ETIMEDOUT';
        throw transientErr;
      }
      return 'recovered-successfully';
    },
    { maxAttempts: 4, initialDelayMs: 50, maxDelayMs: 200 }
  );

  console.log(`Retry executed. Total attempts taken: ${attempts}, Result: ${retryResult}`);
  if (attempts !== 3 || retryResult !== 'recovered-successfully') {
    throw new Error(`Exponential backoff retry test failed. Attempts: ${attempts}`);
  }
  console.log('SUCCESS: Exponential backoff with jitter recovered transient failure!');

  // Test 3: Asynchronous Job Enqueueing & Execution
  console.log('\n[Test 3] Verifying Background Asynchronous Job Queue (helper/asyncQueue.js)');
  
  // Enqueue notification job
  const confirmJob = await queueConsultationConfirmation({
    consultationId: '00000000-0000-0000-0000-000000000001',
    patientEmail: 'test.patient@amrutam.co.in',
    doctorName: 'Dr. Pooja Gupta',
    scheduledAt: '2026-09-20 10:00:00',
  });
  console.log('Enqueued Consultation Confirmation Job:', confirmJob);

  // Enqueue invoice job
  const invoiceJob = await queueInvoiceGeneration({
    paymentId: 'pay_test_001',
    consultationId: '00000000-0000-0000-0000-000000000001',
    amount: 750,
    currency: 'INR',
  });
  console.log('Enqueued Invoice Generation Job:', invoiceJob);

  // Enqueue slot cleanup job
  const cleanupJob = await queueSlotCleanup();
  console.log('Enqueued Expired Slot Sweep Job:', cleanupJob);

  // Wait 350ms for asynchronous worker to process jobs
  await new Promise((r) => setTimeout(r, 350));

  const completedConfirm = await asyncQueue.getJob(confirmJob.jobId);
  console.log('Completed Confirmation Job State:', {
    id: completedConfirm?.id,
    status: completedConfirm?.status,
    result: completedConfirm?.result,
  });

  const completedInvoice = await asyncQueue.getJob(invoiceJob.jobId);
  console.log('Completed Invoice Job State:', {
    id: completedInvoice?.id,
    status: completedInvoice?.status,
    result: completedInvoice?.result,
  });

  if (completedConfirm?.status !== 'completed' || completedInvoice?.status !== 'completed') {
    throw new Error(`Async jobs did not complete. Confirm status: ${completedConfirm?.status}, Invoice status: ${completedInvoice?.status}`);
  }
  console.log('SUCCESS: Background asynchronous tasks processed with status "completed"!');

  console.log('\n==================================================================');
  console.log('--- ALL RATE LIMITING, ASYNC JOBS & RETRY TESTS PASSED! ---');
  console.log('==================================================================');
}

runRateLimitAndAsyncTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test Failed:', err);
    process.exit(1);
  });
