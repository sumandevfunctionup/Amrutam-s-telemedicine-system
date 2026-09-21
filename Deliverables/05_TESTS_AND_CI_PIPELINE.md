# 🧪 Deliverable 5: Test Automation & CI/CD Pipeline

> **PRD Deliverable #5**: Tests and CI pipeline  
> **Master Test Command**: `npm test`  
> **Execution Mode**: Sequential execution with automatic background server lifecycle management  
> **Pass Rate**: **100% (11/11 Suites Passing)**  
> **CI Automation**: [`.github/workflows/ci.yml`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/.github/workflows/ci.yml)

---

## 1. Test Architecture & Automated Runner

All tests are centralized under the [`test/`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/test) directory. The master runner [`test/run_all_tests.js`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/test/run_all_tests.js) provides:
- **Automatic Server Lifecycle**: If `http://localhost:3000/api/v1/health` is not running, the runner spins up `node index.js`, polls until healthy, executes tests, and gracefully terminates the child process.
- **Real-World HTTP Testing**: Performs actual network requests against the Express server, verifying authentication headers, input validation schemas, database locks, and Upstash Redis caches.
- **Zero Flakiness**: Eliminates race conditions with predictable database cleanups and unique test user generation.

---

## 2. Test Suite Catalog

| # | Test Suite | Target Module | What It Validates |
|---|---|---|---|
| **1** | `test/test_module1_auth.js` | Module 1: Auth & RBAC | • User registration with role validation<br>• Bcrypt password hashing verification<br>• Login flow and JWT issuance<br>• TOTP RFC 6238 MFA setup, QR generation & verification<br>• Token refresh lifecycle<br>• Logout and Redis token blacklist revocation |
| **2** | `test/test_module2.js` | Module 2: Doctor Profiles & Slots | • Profile updates (specialties, experience, bio)<br>• Automated cache invalidation on profile change<br>• Availability slot generation with overlap prevention<br>• Date range filtering for slot discovery |
| **3** | `test/test_module3.js` | Module 3: Concurrency Engine | • High-concurrency race condition testing (10 simultaneous contenders)<br>• Two-tier locking: Redis atomic lock (`NX EX 600`) + PostgreSQL `FOR UPDATE`<br>• Zero double-booking verification: Exactly 1 succeeds with `200/201`, remaining fail with `409 Conflict` |
| **4** | `test/test_module4.js` | Module 4: Consultations & SOAP | • Strict 5-state machine transitions (`scheduled` ➔ `in_progress` ➔ `completed` / `cancelled`)<br>• Rejection of invalid status transitions (`400 Bad Request`)<br>• Clinical Ayurvedic SOAP notes recording (Prakriti, Vikriti, Agni)<br>• Patient/Doctor ownership authorization guards |
| **5** | `test/test_module5.js` | Module 5: Prescriptions & EHR | • Digital prescription creation linked to completed consultations<br>• Legal immutability: Rejection of modification/duplicate issue (`409 Conflict`)<br>• Longitudinal patient EHR timeline in chronological descending order<br>• Cross-patient data isolation (`403 Forbidden`) |
| **6** | `test/test_module6.js` | Module 6: Payments & Sagas | • Checkout transaction creation in financial ledger<br>• Choreographed Saga on `payment.failed`: Automatically cancels consultation and releases slot inventory<br>• Idempotent webhook handling<br>• Admin refund processing |
| **7** | `test/test_redis_integration.js` | Module 7: Redis Caching & Search | • Sub-200ms discovery reads on `/api/v1/search/doctors`<br>• Cache hit acceleration: 1st request `MISS`, subsequent `HIT-REDIS`<br>• Token blacklist rejection under 20ms |
| **8** | `test/test_module8.js` | Module 8: Compliance Audit Logs | • Append-only non-repudiation audit logging<br>• Role-based restrictions: Only `admin` can view audit trails (`403 Forbidden` for patients/doctors)<br>• Diff payload verification |
| **9** | `test/test_module9.js` | Module 9: Analytics & BI | • Overview KPIs (Active Doctors, Consultations, Total Revenue)<br>• Daily and weekly volume timeseries aggregation<br>• Doctor utilization rates calculation |
| **10** | `test/test_module10.js` | Module 10: Observability & Infra | • `X-Correlation-ID` ingress generation and propagation<br>• Prometheus scraping on `GET /metrics`<br>• Health probes on `GET /api/v1/health` and Knex pooler tests |
| **11** | `test/test_rate_limit_and_async.js` | Resilience Engine | • Redis sliding-window rate limiting on `/auth/login` (60 req/min)<br>• Background async queue execution (`helper/asyncQueue.js`)<br>• Exponential backoff with decorrelated full jitter (`helper/retry.js`) |

---

## 3. Verified Test Execution Summary

```text
========================================================================
       AMRUTAM TELEMEDICINE BACKEND - MASTER TEST SUITE RUNNER         
       Targeting 100k Consultations / Day & Enterprise Reliability      
========================================================================

[1/11] Running Module 1: Auth, RBAC, MFA & Token Blacklisting... PASSED (7.92s)
[2/11] Running Module 2: Doctor Profiles & Availability Slots... PASSED (6.49s)
[3/11] Running Module 3: Concurrency Engine & Mutex Row Locks... PASSED (8.47s)
[4/11] Running Module 4: Consultation Lifecycle & SOAP Notes... PASSED (8.07s)
[5/11] Running Module 5: Digital Prescriptions & Longitudinal EHR... PASSED (6.35s)
[6/11] Running Module 6: Payments, Saga Rollbacks & Webhooks... PASSED (10.58s)
[7/11] Running Module 7 & Redis: Discovery, Cache & Idempotency... PASSED (9.95s)
[8/11] Running Module 8: Compliance & Admin Audit Logs... PASSED (6.73s)
[9/11] Running Module 9: Admin Analytics & BI Engine... PASSED (7.79s)
[10/11] Running Module 10: Observability, Metrics & Docker/CI... PASSED (0.80s)
[11/11] Running Async & Resilience: Rate Limiting, Retry & Jobs... PASSED (1.92s)

========================================================================
                          TEST EXECUTION SUMMARY                        
========================================================================
┌─────────┬────┬──────────────────────────────────────────────────────┬────────┬──────────────┐
│ (index) │ #  │ Suite                                                │ Result │ Duration (s) │
├─────────┼────┼──────────────────────────────────────────────────────┼────────┼──────────────┤
│ 0       │ 1  │ 'Module 1: Auth, RBAC, MFA & Token Blacklisting'     │ 'PASS' │ '7.92'       │
│ 1       │ 2  │ 'Module 2: Doctor Profiles & Availability Slots'     │ 'PASS' │ '6.49'       │
│ 2       │ 3  │ 'Module 3: Concurrency Engine & Mutex Row Locks'     │ 'PASS' │ '8.47'       │
│ 3       │ 4  │ 'Module 4: Consultation Lifecycle & SOAP Notes'      │ 'PASS' │ '8.07'       │
│ 4       │ 5  │ 'Module 5: Digital Prescriptions & Longitudinal EHR' │ 'PASS' │ '6.35'       │
│ 5       │ 6  │ 'Module 6: Payments, Saga Rollbacks & Webhooks'      │ 'PASS' │ '10.58'      │
│ 6       │ 7  │ 'Module 7 & Redis: Discovery, Cache & Idempotency'   │ 'PASS' │ '9.95'       │
│ 7       │ 8  │ 'Module 8: Compliance & Admin Audit Logs'            │ 'PASS' │ '6.73'       │
│ 8       │ 9  │ 'Module 9: Admin Analytics & BI Engine'              │ 'PASS' │ '7.79'       │
│ 9       │ 10 │ 'Module 10: Observability, Metrics & Docker/CI'      │ 'PASS' │ '0.80'       │
│ 10      │ 11 │ 'Async & Resilience: Rate Limiting, Retry & Jobs'    │ 'PASS' │ '1.92'       │
└─────────┴────┴──────────────────────────────────────────────────────┴────────┴──────────────┘
Total Suites: 11 | Passed: 11 | Failed: 0
Total Test Execution Time: 75.07s
========================================================================

✔ ALL ARCHITECTURAL SUITES PASSED WITH 100% SUCCESS!
```

---

## 4. Continuous Integration Pipeline (`.github/workflows/ci.yml`)

The repository includes a GitHub Actions CI workflow triggered on every push and pull request to `main`:

- **Node.js Matrix**: Builds and validates against Node.js **`20.x`** and **`22.x`**.
- **Automated Steps**:
  1. `actions/checkout@v4` & `actions/setup-node@v4` with cache enabled.
  2. `npm ci` production dependency verification.
  3. Security scanning: `npm audit --audit-level=high`.
  4. Environment hydration from repository secrets or fallback defaults.
  5. Schema migrations check: `npm run migrate`.
  6. Automated test execution: `npm test`.
  7. Multi-stage Docker build validation: `docker build -t amrutam-telemedicine .`.
