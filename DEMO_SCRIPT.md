# Amrutam Telemedicine System — 5-Minute Video Submission Demo Script

> **Purpose**: A step-by-step presenter guide and minute-by-minute walkthrough designed for recording your 5-minute technical demonstration video for the assignment submission.  
> **Target Audience**: Amrutam Engineering Leadership & Hiring Evaluators  
> **Key Message**: Production-ready, enterprise-grade, 100% compliant telemedicine backend engineered for 100,000 daily consultations with zero double-bookings, sub-200ms discovery, transactional sagas, and full observability.

---

## Pre-Recording Checklist
1. **Server Running**: Open a terminal in `Amrutam-s-telemedicine-system` and ensure `npm run dev` or `node index.js` is running on port 3000.
2. **Browser Tabs Open**:
   - Tab 1: Swagger UI Documentation — `http://localhost:3000/api-docs`
   - Tab 2: System Health Diagnostics — `http://localhost:3000/api/v1/health`
   - Tab 3: Prometheus Metrics — `http://localhost:3000/metrics`
3. **Terminal Open**:
   - Tab ready to execute `npm test` to show all 11 architectural suites passing.

---

## Minute-by-Minute Script

### Minute 0:00 – 0:45 | Introduction & Architecture Overview
- **What to show on screen**: Open VS Code or GitHub repository showing `ARCHITECTURE.md` with the Mermaid architecture diagram and database ERD.
- **What to say**:
  > *"Hello, my name is [Your Name], and today I am presenting the backend architecture for Amrutam's Telemedicine System, engineered specifically to satisfy the assignment requirements for 100,000 daily consultations, 99.95% availability, and sub-200ms p95 latencies.*
  >
  > *Our architecture is built on Node.js (ES Modules), Knex with PostgreSQL on Neon, and Upstash Redis. It features a complete modular design across 10 architectural domains: from authentication with TOTP MFA, to a two-tier zero double-booking concurrency engine, payment Sagas with compensating actions, legally immutable Ayurvedic prescriptions, append-only compliance audit trails, and Prometheus telemetry."*

---

### Minute 0:45 – 1:45 | High-Concurrency Booking Engine (Zero Double-Bookings)
- **What to show on screen**: Show the sequence diagram in `ARCHITECTURE.md` or the Swagger UI endpoint `/api/v1/bookings/lock`.
- **What to say**:
  > *"At 100,000 daily consultations, popular Ayurvedic doctors experience massive simultaneous reservation surges. A simple database query will fail or exhaust connection pools.*
  >
  > *To guarantee zero double-bookings, we engineered a Two-Tier Defense:*
  > *First, a sub-5ms Redis Distributed Mutex using `SET NX EX 600`. It catches concurrent contenders at the edge with an instant `409 Conflict`, shielding PostgreSQL connections during flash traffic.*
  > *Second, for the winning request, an atomic PostgreSQL transaction acquires a pessimistic row lock via `SELECT ... FOR UPDATE`, validates slot availability, and increments the slot version with a 10-minute hold window.*
  >
  > *Even under high-velocity parallel requests, exactly one patient secures the reservation, and zero duplicate bookings are mathematically possible."*

---

### Minute 1:45 – 2:45 | Payment Saga & Compensating Rollbacks
- **What to show on screen**: Show Swagger UI `/api/v1/payments/webhook` or the Saga section of `ARCHITECTURE.md`.
- **What to say**:
  > *"For financial and scheduling integrity, we implemented a Choreographed Saga with automated compensating rollbacks.*
  >
  > *When a patient pays, the payment gateway fires a webhook to `/api/v1/payments/webhook`. On `payment.success`, the payment is completed, the consultation is marked `scheduled`, the slot is marked `booked`, and background async jobs dispatch patient confirmations and generate PDF invoices.*
  >
  > *Crucially, if the payment fails (`payment.failed`) or times out, our Saga automatically triggers a compensating transaction: the consultation is marked `cancelled`, and the doctor's availability slot is immediately restored to `available`, releasing inventory back to the platform with a full audit log entry."*

---

### Minute 2:45 – 3:30 | Multi-Dimensional Search & Redis Acceleration
- **What to show on screen**: Show Swagger UI `/api/v1/search/doctors` and execute a search query for `"Panchakarma"` or show the terminal output of `test_redis_integration.js`.
- **What to say**:
  > *"To maintain our sub-200ms read SLA across millions of records, our multi-dimensional search engine leverages Upstash Redis caching.*
  >
  > *Free-text queries by doctor name, specialty, or condition return full doctor profiles with next-available calendar slots. The first request hits the database and caches the result with an HTTP header `X-Cache-Lookup: MISS`. Subsequent requests hit Redis in under 15 milliseconds, returning `X-Cache-Lookup: HIT-REDIS`.*
  >
  > *When doctors update their profiles or calendars, automated cache invalidation purges the relevant Redis keys instantly."*

---

### Minute 3:30 – 4:15 | Clinical Prescriptions, EHR & Compliance Audit Trails
- **What to show on screen**: Show Swagger UI `/api/v1/consultations/{id}/prescription` and `/api/v1/admin/audit-logs`.
- **What to say**:
  > *"On the clinical side, licensed practitioners issue digital Ayurvedic prescriptions with structured JSONB herbal formulations, dosages, Anupana, and dietary Pathya/Apathya guidelines. Once signed, prescriptions are legally immutable—any subsequent attempt to alter or duplicate them returns `409 Conflict`.*
  >
  > *Patient health records are protected by strict RBAC: patients can view their longitudinal medical history, but unauthorized cross-patient access returns `403 Forbidden`.*
  >
  > *Every sensitive action across the entire platform—from logins, to slot bookings, to payment webhooks—is captured in an append-only `audit_logs` table recording actor, IP, User-Agent, and state payloads for total regulatory compliance."*

---

### Minute 4:15 – 5:00 | Observability & Automated Test Suite Execution
- **What to show on screen**: 
  1. Open `http://localhost:3000/metrics` to show Prometheus metrics.
  2. Switch to terminal and run `npm test`.
- **What to say**:
  > *"Finally, for production readiness and observability, our system exports real-time telemetry at `/metrics` for Prometheus and Grafana, including request duration histograms and memory gauges, while injecting distributed correlation IDs via `X-Correlation-ID`.*
  >
  > *Let's run our master test suite with `npm test`."*
  
- **Action**: Run `npm test` in the terminal and let the evaluators see all 11 suites passing in real time.
- **Concluding words**:
  > *"As you can see, all 11 architectural suites—covering authentication, concurrency, prescriptions, payments, Redis caching, compliance audit trails, and async resilience—pass with 100% success.*
  >
  > *This demonstrates a rock-solid, production-ready enterprise backend built for Amrutam's global scale. Thank you!"*

---

## Presentation Tips for High Scoring
1. **Pacing**: Speak at a steady, confident pace. Do not rush.
2. **Clarity**: Keep terminal fonts at a legible size (e.g. 14pt-16pt) so text is crisp on video.
3. **Emphasize Business Value**: Stress how the two-tier mutex protects revenue and doctor credibility, and how the Saga prevents lost inventory.
