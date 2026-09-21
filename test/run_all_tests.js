/**
 * Master Enterprise Test Suite Runner
 * Executes all 10 module suites and Redis/Async integration tests sequentially.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TEST_SUITES = [
  { name: 'Module 1: Auth, RBAC, MFA & Token Blacklisting', file: 'test/test_module1_auth.js' },
  { name: 'Module 2: Doctor Profiles & Availability Slots', file: 'test/test_module2.js' },
  { name: 'Module 3: Concurrency Engine & Mutex Row Locks', file: 'test/test_module3.js' },
  { name: 'Module 4: Consultation Lifecycle & SOAP Notes', file: 'test/test_module4.js' },
  { name: 'Module 5: Digital Prescriptions & Longitudinal EHR', file: 'test/test_module5.js' },
  { name: 'Module 6: Payments, Saga Rollbacks & Webhooks', file: 'test/test_module6.js' },
  { name: 'Module 7 & Redis: Discovery, Cache & Idempotency', file: 'test/test_redis_integration.js' },
  { name: 'Module 8: Compliance & Admin Audit Logs', file: 'test/test_module8.js' },
  { name: 'Module 9: Admin Analytics & BI Engine', file: 'test/test_module9.js' },
  { name: 'Module 10: Observability, Metrics & Docker/CI', file: 'test/test_module10.js' },
  { name: 'Async & Resilience: Rate Limiting, Retry & Jobs', file: 'test/test_rate_limit_and_async.js' },
];

function runSuite(suite) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const filePath = path.join(ROOT_DIR, suite.file);
    const child = spawn('node', [filePath], {
      cwd: ROOT_DIR,
      stdio: 'pipe',
      env: process.env,
    });

    let output = '';
    child.stdout.on('data', (d) => {
      output += d.toString();
    });
    child.stderr.on('data', (d) => {
      output += d.toString();
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        name: suite.name,
        file: suite.file,
        passed: code === 0,
        code,
        duration,
        output,
      });
    });
  });
}

async function ensureServerRunning() {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    if (res.ok) return null;
  } catch {
    // Not running
  }

  console.log('⚡ API server is not running. Automatically spinning up background server for tests...');
  const serverProc = spawn('node', ['index.js'], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    env: process.env,
  });

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`${BASE_URL}/api/v1/health`);
      if (res.ok) {
        console.log('✔ Server ready for integration tests.\n');
        return serverProc;
      }
    } catch {
      // continue waiting
    }
  }
  return serverProc;
}

async function runMasterTest() {
  console.log('========================================================================');
  console.log('       AMRUTAM TELEMEDICINE BACKEND - MASTER TEST SUITE RUNNER         ');
  console.log('       Targeting 100k Consultations / Day & Enterprise Reliability      ');
  console.log('========================================================================\n');

  const childServer = await ensureServerRunning();

  const results = [];
  let allPassed = true;

  for (let i = 0; i < TEST_SUITES.length; i++) {
    const suite = TEST_SUITES[i];
    process.stdout.write(`[${i + 1}/${TEST_SUITES.length}] Running ${suite.name}... `);
    const res = await runSuite(suite);
    results.push(res);

    if (res.passed) {
      console.log(`\x1b[32mPASSED\x1b[0m (${(res.duration / 1000).toFixed(2)}s)`);
    } else {
      console.log(`\x1b[31mFAILED\x1b[0m (exit code: ${res.code}, ${(res.duration / 1000).toFixed(2)}s)`);
      console.error('\n--- Failure Output ---');
      console.error(res.output.slice(-1000));
      console.error('----------------------\n');
      allPassed = false;
    }
  }

  console.log('\n========================================================================');
  console.log('                          TEST EXECUTION SUMMARY                        ');
  console.log('========================================================================');

  console.table(
    results.map((r, idx) => ({
      '#': idx + 1,
      Suite: r.name,
      Result: r.passed ? 'PASS' : 'FAIL',
      'Duration (s)': (r.duration / 1000).toFixed(2),
    }))
  );

  const totalDuration = results.reduce((acc, r) => acc + r.duration, 0);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Total Suites: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
  console.log(`Total Test Execution Time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('========================================================================\n');

  if (childServer) {
    try {
      childServer.kill('SIGTERM');
    } catch {
      // ignore
    }
  }

  if (allPassed) {
    console.log('\x1b[32m✔ ALL ARCHITECTURAL SUITES PASSED WITH 100% SUCCESS!\x1b[0m\n');
    process.exit(0);
  } else {
    console.error('\x1b[31m✖ SOME TEST SUITES FAILED. SEE DETAILS ABOVE.\x1b[0m\n');
    process.exit(1);
  }
}

runMasterTest();
