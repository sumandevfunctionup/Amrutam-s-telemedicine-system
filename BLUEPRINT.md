# Amrutam Telemedicine System — Master Technical Blueprint & Specification

> **Document Version**: 1.0.0  
> **Source PRD**: `PRD/Backend Developer Assignment  new.pdf`  
> **System Scale**: 100,000 daily consultations  
> **Performance SLA**: Latency p95 < 200ms (reads), < 500ms (writes) | Availability: 99.95%  
> **Security Standards**: RBAC, MFA, Data Classification, OWASP Top 10, Write Idempotency  

---

## 1. Executive Summary & Problem Scope

Amrutam’s Telemedicine platform provides high-availability healthcare delivery, Ayurvedic consultations, doctor scheduling, and digital prescription issuance. This blueprint translates all requirements from the PRD into an enterprise-grade, module-by-module architectural roadmap.

### 1.1 Core Deliverables Checklist (PRD Section 1)
- [x] **Git repo with modular code & infrastructure**
- [x] **README with comprehensive local & production setup**
- [x] **OpenAPI 3.0 / Swagger schema** (`/api-docs` and `/api-docs.json`)
- [x] **Architecture Specification** (System flow, sequence diagrams, ERD, partitioning, Sagas, DR)
- [x] **Automated Tests & CI/CD Pipeline** (Unit, Integration, GitHub Actions)
- [x] **Observability Suite** (Structured JSON logging, Prometheus metrics, Request Correlation IDs)
- [x] **Security Checklist & Threat Model** (OWASP mitigation, RBAC, MFA, Idempotency)

---

## 2. Evaluation Rubric & Scoring Matrix

| Category | Max Score | PRD Criterion | Amrutam Architecture Implementation |
| :--- | :---: | :--- | :--- |
| **Architecture** | 20 | High-level data flow, modularity, DI, sequence diagrams | Layered architecture (`controller/`, `router/`, `db/`, `helper/`, `auth/`, `services/`), decoupled modules, transaction isolation |
| **Core Flows** | 20 | Auth, availability, booking, consultation, prescriptions, payments | End-to-end transactional workflows with strict state-machine validations |
| **Code Quality** | 15 | Clean code, error handling, standardized responses | Consistent API response contracts, validation schemas (Joi/Zod), ES modules |
| **Security** | 10 | Encryption, MFA, RBAC, threat modeling, sanitization | JWT + Refresh tokens, bcrypt (cost 12), TOTP MFA, Helmet, parameterization |
| **Observability**| 10 | Metrics, structured logs, distributed tracing | Morgan/Winston correlation IDs, Prometheus `/metrics`, health & DB readiness probes |
| **Scalability** | 10 | 100k daily consultations, p95 SLAs, pooling, partitioning | PostgreSQL connection pool tuning, table partitioning, Redis caching layer |
| **Infra / CI** | 10 | Docker, CI pipelines, automated tests | Dockerfile, Docker Compose (Postgres + Redis), GitHub Actions CI |
| **BONUS** | **+10** | **Critical security + Idempotency for writes** | **Mandatory write idempotency (`idempotency_keys` table + middleware) & cryptographic signing** |
| **Total** | **110/100**| | |

---

## 3. Module-by-Module Technical Breakdown

```mermaid
graph TD
    Client[Patient / Doctor / Admin Client] --> Gateway[API Gateway / Express Router]
    Gateway --> AuthMW[Auth & RBAC Middleware]
    Gateway --> RateLimit[Rate Limiter & Idempotency Filter]

    subgraph Core Business Services
        AuthService[Module 1: User & Auth Service]
        DoctorService[Module 2: Doctor & Schedule Service]
        BookingService[Module 3: Booking & Concurrency Engine]
        ConsultService[Module 4: Consultation Lifecycle Engine]
        RxService[Module 5: Prescription & EHR Service]
        PaymentService[Module 6: Payment & Billing Saga]
        SearchService[Module 7: Discovery & Search Engine]
        AuditService[Module 8: Audit & Compliance Logger]
        AdminService[Module 9: Admin Analytics Engine]
    end

    AuthMW --> AuthService
    Gateway --> DoctorService
    RateLimit --> BookingService
    Gateway --> ConsultService
    Gateway --> RxService
    RateLimit --> PaymentService
    Gateway --> SearchService
    Gateway --> AdminService

    Core Business Services --> Postgres[(PostgreSQL 16 DB)]
    Core Business Services --> RedisCache[(Redis Cache & Locks)]
    Core Business Services --> AuditService
    AuditService --> Postgres
```

---

### Module 1: User Lifecycle, Authentication & RBAC
- **Scope**: User registration, credential management, Multi-Factor Authentication (MFA/TOTP), role-based access control.
- **Roles**: `patient`, `doctor`, `admin`.
- **Security Mechanisms**:
  - Passwords hashed with `bcrypt` (12 rounds).
  - JWT Access Tokens (short-lived: 15m) + secure HTTP-only Refresh Tokens (7 days).
  - MFA via RFC 6238 TOTP (Google Authenticator / Authy compatibility) for sensitive actions & doctor/admin access.
  - Role check middleware: `authorize('admin')`, `authorize('doctor', 'admin')`.
- **Endpoints**:
  - `POST /api/v1/auth/register` (Registration with profile initialization)
  - `POST /api/v1/auth/login` (Returns access token or requires MFA challenge)
  - `POST /api/v1/auth/mfa/setup` (Generates QR/secret)
  - `POST /api/v1/auth/mfa/verify` (Verifies code and activates MFA)
  - `POST /api/v1/auth/refresh-token` (Issues new access token)
  - `GET  /api/v1/users/me` (Profile fetch)
  - `PUT  /api/v1/users/me` (Profile update)

---

### Module 2: Doctor Profiles & Availability Management
- **Scope**: Doctor profiles, Ayurveda specializations, license validation, consultation fee configuration, and calendar slot generation.
- **Ayurveda Specializations**: *Kayachikitsa (Internal Medicine)*, *Panchakarma (Detoxification)*, *Shalya Tantra (Surgery)*, *Prasuti & Stri Roga (Gynecology)*, *Dravyaguna (Pharmacology)*, etc.
- **Slot Management**:
  - Doctors generate daily, weekly, or recurring availability slots.
  - Slot durations: 15, 30, or 60 minutes.
  - States: `available`, `locked` (in booking progress), `booked`, `cancelled`.
- **Endpoints**:
  - `GET  /api/v1/doctors/:id` (Doctor public profile)
  - `PUT  /api/v1/doctors/profile` (Doctor updates bio, fee, experience)
  - `POST /api/v1/doctors/slots` (Batch slot creation)
  - `GET  /api/v1/doctors/:id/slots` (Fetch public available slots for a date range)
  - `DELETE /api/v1/doctors/slots/:slotId` (Cancel/delete unused slot)

---

### Module 3: Booking Engine & High-Concurrency Handling (Critical Path)
- **Scale Target**: 100k daily consultations (~70 bookings/minute average, up to 1,500 bookings/minute peak surges).
- **Concurrency Strategy (Zero Double-Booking)**:
  1. **Optimistic Locking via Versioning**: `availability_slots.version` incremented on state change.
  2. **Pessimistic Row-Level Lock**: `SELECT ... FOR UPDATE` inside an ACID transaction during lock/booking checkout.
  3. **Distributed Redis Mutex** (Optional high-scale layer): `SET slot:{id}:lock {patientId} NX EX 300` (holds slot for 5 minutes during payment).
- **Write Idempotency**:
  - Client sends `Idempotency-Key` HTTP header (UUIDv4).
  - Stored in `idempotency_keys` table. Repeated requests return cached response without duplicate transactions.
- **Endpoints**:
  - `POST /api/v1/bookings/lock` (Temporarily reserves a slot for checkout, idempotent)
  - `POST /api/v1/bookings/confirm` (Finalizes booking upon payment confirmation)
  - `POST /api/v1/bookings/cancel` (Releases slot back to `available`)

---

### Module 4: Consultation Lifecycle & Real-Time Coordination
- **States**: `scheduled` $\rightarrow$ `in_progress` $\rightarrow$ `completed` / `cancelled` / `no_show`.
- **Capabilities**:
  - Generates secure video/audio consultation rooms (WebRTC / Jitsi / Twilio room tokens).
  - Real-time status transitions with state machine validation (e.g. cannot transition `completed` to `cancelled`).
  - Doctor consultation notes (SOAP format: Subjective, Objective, Assessment, Plan).
- **Endpoints**:
  - `GET  /api/v1/consultations` (List consultations for patient or doctor with pagination)
  - `GET  /api/v1/consultations/:id` (Details, status, meeting room credentials)
  - `PATCH /api/v1/consultations/:id/start` (Transition to `in_progress`)
  - `PATCH /api/v1/consultations/:id/complete` (Transition to `completed`, prompts prescription)
  - `PATCH /api/v1/consultations/:id/cancel` (Cancellation with reason)

---

### Module 5: Prescriptions & Electronic Health Records (EHR)
- **Scope**: Digital Ayurvedic prescriptions with structured dosage, timing, and dietary instructions (Pathya/Apathya).
- **Data Model**:
  - JSONB structured medications: `[{ name: "Ashwagandha Churna", dosage: "1 tsp", frequency: "twice daily", timing: "after meals with warm milk", duration_days: 30 }]`.
  - Diagnosis, lifestyle advice, follow-up date.
  - Immutability: Once signed and issued, prescriptions cannot be modified.
- **Endpoints**:
  - `POST /api/v1/consultations/:id/prescription` (Doctor creates and signs prescription)
  - `GET  /api/v1/consultations/:id/prescription` (Retrieve prescription)
  - `GET  /api/v1/prescriptions/patient/:patientId` (Patient historical records)

---

### Module 6: Payment Processing & Transaction Management (Saga Pattern)
- **Scope**: Payment initiation, gateway webhook handling, automated refunds on cancellation, ledger entries.
- **States**: `pending` $\rightarrow$ `completed` / `failed` / `refunded`.
- **Idempotency & Sagas**:
  - Dual-phase commit emulation or Choreographed Saga:
    1. *Step 1*: Reserve Slot (`locked`)
    2. *Step 2*: Create Payment Record (`pending`)
    3. *Step 3*: Process Payment
    4. *Compensating Action*: If payment fails, unlock Slot (`available`) and mark Payment `failed`.
- **Endpoints**:
  - `POST /api/v1/payments/initiate` (Creates order & payment intent)
  - `POST /api/v1/payments/webhook` (Idempotent payment provider callback)
  - `POST /api/v1/payments/:id/refund` (Processes refund upon consultation cancellation)

---

### Module 7: Search, Discovery & Filtering Engine
- **Target SLA**: p95 < 200ms latency across 100k daily dataset.
- **Filtering Dimensions**: Specialization, experience years, price range, doctor gender, language, next available date/time, star rating.
- **Database Optimization**:
  - Composite B-Tree indexes: `(specialization, is_verified, rating DESC)`.
  - GiST / Full-Text Search indexing on doctor bios and profiles.
  - In-memory caching for hot doctor profiles via Redis (TTL: 10 minutes).
- **Endpoints**:
  - `GET /api/v1/search/doctors` (Search query, filters, sort, cursor-based pagination)
  - `GET /api/v1/search/specializations` (List active Ayurvedic categories)

---

### Module 8: Compliance, Security & Audit Trails
- **Audit Logging**:
  - High-precision audit trail for all write operations, auth attempts, record access, and cancellations.
  - Non-repudiation: Captures `user_id`, `ip_address`, `user_agent`, `action`, `entity_type`, `entity_id`, and diff payload (`details` JSONB).
- **Data Classification & Privacy**:
  - PII (Personally Identifiable Information): Name, phone, email $\rightarrow$ encrypted at rest.
  - PHI (Protected Health Information): Notes, prescriptions $\rightarrow$ restricted access control.
- **OWASP Top 10 Protections**:
  - Rate Limiting: 100 requests/minute general, 5 requests/minute for auth/login.
  - Input Sanitization & Validation: Strict validation (Zod/Joi) on all requests.
  - Security Headers: Helmet enabled with strict HSTS, XSS protections, no-sniff.
- **Endpoints**:
  - `GET /api/v1/admin/audit-logs` (Filtered by entity, user, date range)

---

### Module 9: Admin Analytics & Platform Intelligence
- **Scope**: Platform health metrics, consultation volumes, fulfillment rates, doctor activity, and revenue breakdown.
- **Analytics Queries**:
  - Total consultations today vs historical trends (aimed at tracking 100k daily capacity).
  - Cancellation & No-Show rates.
  - Average consultation duration.
  - Doctor utilization percentage.
- **Endpoints**:
  - `GET /api/v1/admin/analytics/overview` (Key KPI metrics)
  - `GET /api/v1/admin/analytics/consultations` (Timeseries breakdown)
  - `GET /api/v1/admin/analytics/revenue` (Financial performance)

---

### Module 10: Infrastructure, Observability & CI/CD
- **Observability**:
  - Metrics: Prometheus scraping endpoint `/metrics` tracking request duration, HTTP status codes, DB connection pool utilization, and active consultations.
  - Tracing: Unique `X-Correlation-ID` header injected on ingress and propagated across all logs.
  - Health & Readiness: `/api/v1/health` and `/api/v1/db-test`.
- **Infrastructure**:
  - Docker containerization (`Dockerfile` multi-stage build).
  - Docker Compose (`docker-compose.yml`) for local testing.
  - GitHub Actions CI pipeline running linting, automated unit/integration tests, and security scans (`npm audit`).

---

## 4. Architecture Tasks & Technical Strategies (PRD Requirements)

### 4.1 Sequence Diagram: High-Concurrency Booking Flow

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant API as API Gateway / Router
    participant LockEngine as Concurrency / Lock Engine
    participant DB as PostgreSQL DB
    participant Gateway as Payment Gateway

    Patient->>API: POST /bookings/lock (slotId, Idempotency-Key)
    API->>LockEngine: Acquire slot lock
    LockEngine->>DB: BEGIN TX; SELECT * FROM availability_slots WHERE id = slotId FOR UPDATE;
    alt Slot already booked or locked
        DB-->>LockEngine: Status != 'available'
        LockEngine-->>API: Conflict Error (409)
        API-->>Patient: "Slot no longer available"
    else Slot is available
        LockEngine->>DB: UPDATE availability_slots SET status = 'locked', version = version + 1 WHERE id = slotId;
        LockEngine->>DB: INSERT INTO consultations (status = 'pending_payment');
        LockEngine->>DB: COMMIT TX;
        LockEngine-->>API: Lock acquired (expires in 5 min)
        API-->>Patient: Lock confirmed, proceed to payment
    end

    Patient->>API: POST /payments/checkout (consultationId, paymentToken)
    API->>Gateway: Charge customer
    alt Payment Successful
        Gateway-->>API: Success (txn_id)
        API->>DB: BEGIN TX;
        API->>DB: UPDATE availability_slots SET status = 'booked';
        API->>DB: UPDATE consultations SET status = 'scheduled';
        API->>DB: INSERT INTO payments (status = 'completed');
        API->>DB: COMMIT TX;
        API-->>Patient: Booking Confirmed (HTTP 200)
    else Payment Failed
        Gateway-->>API: Failed
        API->>DB: UPDATE availability_slots SET status = 'available';
        API->>DB: UPDATE consultations SET status = 'cancelled';
        API-->>Patient: Payment Failed, slot released (HTTP 402)
    end
```

---

### 4.2 Data Partitioning Strategy (Scale: 100k Daily Consultations)
At 100k consultations/day:
- 1 month = ~3 million consultations.
- 1 year = ~36.5 million consultations + 73 million audit records + 36.5 million payment records.

**Strategy**:
- **PostgreSQL Range Partitioning by Month**:
  - Partition `consultations` on `created_at` (e.g., `consultations_2026_09`, `consultations_2026_10`).
  - Partition `audit_logs` on `created_at` (monthly range partitions).
  - Partition `availability_slots` by range on `start_time`.
- **Query Routing**: Queries filtering on date automatically benefit from **Partition Pruning**, eliminating 95%+ of table scan overhead.

---

### 4.3 Caching & Concurrency Handling Strategy
- **Layer 1 (Read-Through Cache)**:
  - Doctor profiles, specializations, and daily schedules cached in Redis with short TTL (5–15 mins).
  - Cache Invalidation on doctor profile updates or slot mutations via Cache-Aside pattern.
- **Layer 2 (Concurrency & Race Conditions)**:
  - Optimistic locking using integer `version` field for optimistic checks.
  - Database row-level locking (`FOR UPDATE NOWAIT`) preventing two concurrent booking requests from grabbing the same slot.

---

### 4.4 Retry & Exponential Backoff Strategy
- Applied to external third-party calls (Payment Gateways, SMS/Email OTP services, Video room token generation).
- **Algorithm**:
  $$\text{Delay} = \min(\text{base} \times 2^{\text{attempt}} + \text{jitter}, \text{max\_delay})$$
  - Base delay: 200ms, Multiplier: 2, Jitter: $\pm 20\%$, Max delay: 3000ms, Max attempts: 3.
- Database transient connection errors (Neon cloud pooling/cold starts) automatically retry up to 2 times.

---

### 4.5 Disaster Recovery & Backup Strategy
- **RPO (Recovery Point Objective)**: $\le 5$ minutes.
- **RTO (Recovery Time Objective)**: $\le 30$ minutes.
- **Implementation**:
  - Automated continuous WAL (Write-Ahead Logging) archiving with point-in-time recovery (PITR).
  - Daily snapshot backups stored in geo-redundant S3/cloud storage.
  - Read-replica offloading for analytical queries and disaster failover.

---

## 5. Phased Implementation Roadmap

```text
Phase 1: Database Architecture & Core Migrations (Current Step)
         ├── Full PostgreSQL schema creation (9 tables, constraints, indexes)
         └── Realistic seed dataset (Doctors, patients, slots, sample consultations)

Phase 2: Authentication, Authorization & Security Module
         ├── JWT auth + Refresh tokens + Role-based middleware
         ├── MFA (TOTP) setup and validation
         └── Write Idempotency middleware (Idempotency-Key validation)

Phase 3: Doctor Availability & Concurrency-Safe Booking Engine
         ├── Doctor profile & slot generation
         ├── Optimistic & row-level locking for zero double-bookings
         └── Swagger annotations for all booking endpoints

Phase 4: Consultation Lifecycle, Prescriptions & Payments
         ├── State machine transitions (scheduled -> in_progress -> completed)
         ├── Electronic prescription issuance (JSONB medications)
         └── Mock payment intent & webhook handling

Phase 5: Search, Audit Trails & Admin Analytics
         ├── High-performance doctor search & filtering (p95 < 200ms)
         ├── Automated audit trail logging for all sensitive transactions
         └── Admin analytics metrics

Phase 6: Observability, CI/CD Pipeline & Final Documentation
         ├── Prometheus metrics endpoint & correlation ID tracking
         ├── Dockerfile & GitHub Actions CI configuration
         └── 2–4 page architecture document & demo preparation
```
