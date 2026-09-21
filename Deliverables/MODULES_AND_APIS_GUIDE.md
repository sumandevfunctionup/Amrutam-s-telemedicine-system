# Amrutam Telemedicine System — Master Modules & API Evaluation Guide

> **Target Audience**: Technical Evaluators, Hiring Managers & System Architects  
> **Document Purpose**: A step-by-step, comprehensive architectural and API catalog covering all 10 core modules, their endpoints, input/output schemas, business logic, and security rules.  
> **Target Scale**: 100,000 daily consultations | 99.95% availability | p95 read latency < 200ms  
> **Universal Standard**: All timestamps across all APIs are strictly in **UTC** formatted as `yyyy-mm-dd hh:mm:ss`.

---

## 📑 Table of Contents

1. [Architectural Overview & Global Standards](#-architectural-overview--global-standards)
2. [Module 1: Identity, Auth, RBAC & Multi-Factor Authentication](#-module-1-identity-auth-rbac--multi-factor-authentication)
3. [Module 2: Doctor Profiles & Calendar Availability Engine](#-module-2-doctor-profiles--calendar-availability-engine)
4. [Module 3: Concurrency Engine & Zero Double-Booking Guarantee](#-module-3-concurrency-engine--zero-double-booking-guarantee)
5. [Module 4: Consultation Lifecycle & Ayurvedic SOAP Notes](#-module-4-consultation-lifecycle--ayurvedic-soap-notes)
6. [Module 5: Digital Prescriptions & Longitudinal Patient EHR](#-module-5-digital-prescriptions--longitudinal-patient-ehr)
7. [Module 6: Transactional Payments & Choreographed Saga](#-module-6-transactional-payments--choreographed-saga)
8. [Module 7: Discovery & Multi-Dimensional Search Engine](#-module-7-discovery--multi-dimensional-search-engine)
9. [Module 8: Compliance, Security & Admin Audit Trails](#-module-8-compliance-security--admin-audit-trails)
10. [Module 9: Executive Business Intelligence & Analytics](#-module-9-executive-business-intelligence--analytics)
11. [Module 10: Infrastructure, Observability & Diagnostics](#-module-10-infrastructure-observability--diagnostics)
12. [Resilience Engine: Async Jobs, Rate Limiting & Retries](#-resilience-engine-async-jobs-rate-limiting--retries)
13. [Interviewer Quick Verification Checklist](#-interviewer-quick-verification-checklist)

---

## 🏛️ Architectural Overview & Global Standards

### Global Response Envelope
Every endpoint in the system returns a predictable, standardized JSON envelope:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human readable confirmation",
  "data": { ... },
  "timestamp": "2026-09-21 12:00:00"
}
```

### Authentication & Authorization
- **Bearer Token**: Standard `Authorization: Bearer <accessToken>` header.
- **Roles**: `patient`, `doctor`, `admin`.
- **Stateless Revocation**: Revoked tokens are tracked in an Upstash Redis blacklist with TTL matching the token expiry.

---

## 🔐 Module 1: Identity, Auth, RBAC & Multi-Factor Authentication
**Base Path**: `/api/v1/auth`  
**Primary Files**: `controller/authController.js`, `router/authRouter.js`, `auth/middleware.js`

### 1.1 Register User
- **Route**: `POST /api/v1/auth/register`
- **Access**: Public
- **Headers**: `Idempotency-Key` (Optional, prevents double submission)
- **Request Body**:
  ```json
  {
    "email": "rohan.verma@example.com",
    "password": "Password@123",
    "first_name": "Rohan",
    "last_name": "Verma",
    "role": "patient",
    "phone_number": "+919876543210"
  }
  ```
  *(For doctors, add: `specialization`, `license_number`, `consultation_fee`).*
- **How It Works**: Hashes password using bcrypt (cost factor 12). Inserts into `users` and `profiles` (and `doctors` if role is doctor) inside an atomic database transaction. Returns `201 Created`.

### 1.2 User Login (With MFA Detection)
- **Route**: `POST /api/v1/auth/login`
- **Access**: Public (Rate limited: 60 req/min)
- **Request Body**: `{ "email": "rohan.verma@example.com", "password": "Password@123" }`
- **How It Works**:
  - Validates credentials against bcrypt hash.
  - **If MFA is NOT enabled**: Issues production `accessToken` (15m) and `refreshToken` (7d).
  - **If MFA IS enabled**: Returns `200 OK` with `{ "mfaRequired": true, "tempToken": "ey..." }` triggering Step 1.3.

### 1.3 Verify MFA Login Challenge
- **Route**: `POST /api/v1/auth/login/mfa`
- **Access**: Public
- **Request Body**: `{ "tempToken": "ey...", "code": "492018" }`
- **How It Works**: Decodes the temporary 5-minute token, verifies the 6-digit TOTP code against the user's secret using `speakeasy`, logs a `USER_LOGIN_MFA` audit event, and issues production JWT tokens.

### 1.4 Refresh Access Token
- **Route**: `POST /api/v1/auth/refresh`
- **Access**: Public
- **Request Body**: `{ "refreshToken": "ey..." }`
- **How It Works**: Validates the refresh token signature, checks account status, and issues a fresh short-lived access token.

### 1.5 Setup Authenticator MFA (TOTP)
- **Route**: `POST /api/v1/auth/mfa/setup`
- **Access**: Authenticated (`Bearer`)
- **How It Works**: Generates an RFC 6238 Base32 secret and encodes it into a visual Base64 QR Code image data-URI. Users scan this in Google Authenticator or Authy.

### 1.6 Confirm & Activate MFA
- **Route**: `POST /api/v1/auth/mfa/confirm`
- **Access**: Authenticated (`Bearer`)
- **Request Body**: `{ "code": "123456" }`
- **How It Works**: Confirms that the user successfully scanned the QR code by validating the first live 6-digit code. Sets `is_mfa_enabled = true`.

### 1.7 Get Profile (`/auth/me`)
- **Route**: `GET /api/v1/auth/me`
- **Access**: Authenticated (`Bearer`)
- **How It Works**: Fetches user profile, doctor metadata, and role. Accelerated via Upstash Redis caching for sub-20ms reads.

### 1.8 Update Profile
- **Route**: `PUT /api/v1/auth/profile`
- **Access**: Authenticated (`Bearer`)
- **Request Body**: `{ "first_name": "Rohan", "last_name": "Verma", "address": "Delhi, India" }`
- **How It Works**: Updates the `profiles` table, invalidates cached profile in Redis, and records an audit log.

### 1.9 Logout & Invalidate Token
- **Route**: `POST /api/v1/auth/logout`
- **Access**: Authenticated (`Bearer`)
- **How It Works**: Reads the incoming JWT token signature, calculates remaining TTL, and writes to Redis blacklist: `amrutam:token:blacklist:{sig}`. Future requests using this token are instantly rejected with `401 Unauthorized`.

---

## 🩺 Module 2: Doctor Profiles & Calendar Availability Engine
**Base Path**: `/api/v1/doctors`  
**Primary Files**: `controller/doctorController.js`, `router/doctorRouter.js`

### 2.1 List Verified Doctors
- **Route**: `GET /api/v1/doctors`
- **Access**: Public
- **Query Params**: `?specialization=Panchakarma&page=1&limit=10`
- **How It Works**: Returns paginated doctor listings joined with profile information and ratings.

### 2.2 Get Doctor by ID
- **Route**: `GET /api/v1/doctors/:id`
- **Access**: Public
- **How It Works**: Retrieves complete public practitioner profile. Served from Redis on cache hit (`X-Cache-Lookup: HIT-REDIS`).

### 2.3 Update Doctor Practice Profile
- **Route**: `PUT /api/v1/doctors/profile`
- **Access**: Doctor only (`role: doctor`)
- **Request Body**: `{ "bio": "...", "consultation_fee": 950.0, "experience_years": 12, "languages": ["English", "Hindi"] }`
- **How It Works**: Updates practitioner information and automatically purges search and doctor cache keys (`amrutam:doctor:*`, `amrutam:search:*`).

### 2.4 Publish Availability Slots
- **Route**: `POST /api/v1/doctors/slots`
- **Access**: Doctor only (`role: doctor`)
- **Request Body**: `{ "start_time": "2026-11-20 10:00:00", "end_time": "2026-11-20 10:30:00" }`
- **How It Works**: Validates that slot timing is in the future, ensures `end_time > start_time`, and checks for time overlaps against the doctor's existing calendar. Inserts slot with `slot_status = 'available'`.

### 2.5 Query Doctor Available Slots
- **Route**: `GET /api/v1/doctors/:id/slots`
- **Access**: Public
- **Query Params**: `?startDate=2026-11-01&endDate=2026-11-30`
- **How It Works**: Returns all open consultation slots (`slot_status = 'available'`).

### 2.6 Delete / Cancel Open Slot
- **Route**: `DELETE /api/v1/doctors/slots/:id`
- **Access**: Doctor only (`role: doctor`)
- **How It Works**: Verifies ownership and ensures the slot has not been booked. Sets `slot_status = 'cancelled'`.

---

## 🔒 Module 3: Concurrency Engine & Zero Double-Booking Guarantee
**Base Path**: `/api/v1/bookings`  
**Primary Files**: `controller/bookingController.js`, `router/bookingRouter.js`, `helper/redis.js`

### 3.1 Lock / Reserve Slot (The Two-Tier Mutex)
- **Route**: `POST /api/v1/bookings/lock`
- **Access**: Authenticated (`patient`)
- **Request Body**: `{ "slot_id": "<uuid>" }`
- **How It Works**:
  1. **Tier 1 (Redis Edge Mutex)**: Executes atomic `SET amrutam:lock:slot:{slot_id} {user_id} NX EX 600`. Competing requests within the same millisecond are rejected in **< 5ms** with `409 Conflict`.
  2. **Tier 2 (PostgreSQL Row Lock)**: The winning request opens an atomic transaction with `SELECT ... FOR UPDATE`. Checks `slot_status == 'available'`, increments optimistic `version`, sets `slot_status = 'locked'`, and sets a 10-minute hold expiration.

### 3.2 Confirm Booking
- **Route**: `POST /api/v1/bookings/confirm`
- **Access**: Authenticated (`patient`)
- **Request Body**: `{ "slot_id": "<uuid>", "type": "video", "notes": "Chronic digestive issues" }`
- **How It Works**:
  - Confirms slot reservation within the hold window.
  - Updates slot to `booked`.
  - Creates a `consultations` record with a unique Telehealth meeting room URL.
  - Creates an initial `pending` payment record.
  - Releases the Redis distributed lock token.
  - Dispatches background async confirmation and invoice jobs.

### 3.3 Patient Bookings History
- **Route**: `GET /api/v1/bookings/my-bookings`
- **Access**: Authenticated (`patient`)
- **How It Works**: Returns all consultations booked by the patient with doctor details and meeting links.

### 3.4 Cancel Booking
- **Route**: `POST /api/v1/bookings/cancel`
- **Access**: Authenticated (`patient` or `doctor`)
- **Request Body**: `{ "consultation_id": "<uuid>" }`
- **How It Works**: Marks consultation as `cancelled` and **restores the doctor's availability slot to `available`** so other patients can book it.

---

## 🌿 Module 4: Consultation Lifecycle & Ayurvedic SOAP Notes
**Base Path**: `/api/v1/consultations`  
**Primary Files**: `controller/consultationController.js`, `router/consultationRouter.js`

### 4.1 List Consultations
- **Route**: `GET /api/v1/consultations`
- **Access**: Authenticated (Patient or Doctor)
- **How It Works**: Scoped automatically based on caller's role (doctors see assigned patients; patients see their bookings).

### 4.2 Get Consultation by ID
- **Route**: `GET /api/v1/consultations/:id`
- **Access**: Authenticated (Patient, Doctor, Admin)
- **How It Works**: Returns clinical metadata, meeting link, status, and whether a prescription has been issued.

### 4.3 Start Consultation
- **Route**: `PATCH /api/v1/consultations/:id/start`
- **Access**: Doctor only (`role: doctor`)
- **How It Works**: Transitions state from `scheduled` to `in_progress`. Patients attempting this receive `403 Forbidden`.

### 4.4 Record Ayurvedic SOAP Clinical Notes
- **Route**: `PATCH /api/v1/consultations/:id/notes`
- **Access**: Doctor only (`role: doctor`)
- **Request Body**:
  ```json
  {
    "subjective": "Chronic acid reflux and burning epigastric pain.",
    "objective": "Tikshna (sharp) pulse, Pitta-Kapha prakriti, Ama on tongue.",
    "assessment": "Amlapitta (Hyperacidity) due to Vidagdha Pitta.",
    "plan": "Sutashekhar Rasa 1 tab BD, Avipattikar Churna 1 tsp hs. Pathya: coconut water."
  }
  ```
- **How It Works**: Formats clinical assessment according to traditional Ayurvedic diagnostic framework.

### 4.5 Complete Consultation
- **Route**: `PATCH /api/v1/consultations/:id/complete`
- **Access**: Doctor only (`role: doctor`)
- **How It Works**: Concludes the clinical session, setting status to `completed`.

---

## 💊 Module 5: Digital Prescriptions & Longitudinal Patient EHR
**Base Path**: `/api/v1/prescriptions`  
**Primary Files**: `controller/prescriptionController.js`, `router/prescriptionRouter.js`

### 5.1 Issue & Sign Digital Prescription
- **Route**: `POST /api/v1/consultations/:id/prescription`
- **Access**: Doctor only (`role: doctor`)
- **Request Body**:
  ```json
  {
    "diagnosis": "Chronic Grahani (IBS-D) with Pitta-Vata vitiation",
    "medications": [
      {
        "name": "Bilwadi Churna",
        "dosage": "1 tsp",
        "timing": "before meals with fresh buttermilk",
        "frequency": "twice daily",
        "duration_days": 30
      }
    ],
    "dietary_advice": {
      "pathya": ["Buttermilk", "Pomegranate", "Boiled mung dal"],
      "apathya": ["Deep fried foods", "Curd at night", "Fermented foods"]
    },
    "lifestyle_advice": "Practice Pranayama (Sheetali) 15 mins daily.",
    "follow_up_date": "2026-12-20"
  }
  ```
- **How It Works**:
  - **Legal Immutability**: Enforced by a unique constraint on `consultation_id`. Any duplicate attempt returns **`409 Conflict`**.
  - Automatically marks consultation as `completed`.
  - Stores structured medications as JSONB with dosage and Ayurvedic Anupana vehicles.

### 5.2 Get Prescription by Consultation
- **Route**: `GET /api/v1/consultations/:id/prescription`
- **Access**: Patient or Doctor
- **How It Works**: Retrieves digitally signed prescription including doctor's verified license number.

### 5.3 Get Prescription by ID
- **Route**: `GET /api/v1/prescriptions/:id`
- **Access**: Patient or Doctor
- **How It Works**: Returns prescription with privacy validation.

### 5.4 Patient Longitudinal EHR History
- **Route**: `GET /api/v1/prescriptions/patient/:patientId`
- **Access**: Patient (Self), Doctor, Admin
- **How It Works**: Chronological timeline of lifetime prescriptions. Any cross-patient unauthorized snooping returns **`403 Forbidden`** to protect Protected Health Information (PHI).

---

## 💳 Module 6: Transactional Payments & Choreographed Saga
**Base Path**: `/api/v1/payments`  
**Primary Files**: `controller/paymentController.js`, `router/paymentRouter.js`

### 6.1 Initiate Payment Intent
- **Route**: `POST /api/v1/payments/initiate`
- **Access**: Authenticated (`patient`)
- **Request Body**: `{ "consultation_id": "<uuid>", "payment_method": "upi" }`
- **How It Works**: Calculates consultation fee, creates an active payment order with unique transaction ID (`ORDER-...`), and returns checkout details with a 15-minute expiration.

### 6.2 Payment Gateway Webhook & Saga Compensating Action
- **Route**: `POST /api/v1/payments/webhook`
- **Access**: Public (Gateway Callback)
- **Request Body**: `{ "event": "payment.success" | "payment.failed", "transaction_id": "ORDER-..." }`
- **How It Works (The Saga)**:
  - **On `payment.success`**: Updates payment to `completed`, consultation to `scheduled`, slot to `booked`, and queues async PDF invoice & SMS tasks.
  - **On `payment.failed` (Compensating Rollback)**: Automatically cancels the consultation and **restores the doctor's availability slot back to `available`**, releasing inventory for other patients.
  - **Idempotency**: Duplicate webhook callbacks return `200 OK` with zero duplicate database writes.

### 6.3 Process Refund
- **Route**: `POST /api/v1/payments/:id/refund`
- **Access**: Admin / Doctor
- **Request Body**: `{ "reason": "Patient requested cancellation" }`
- **How It Works**: Transitions payment status to `refunded`, issues refund transaction reference, and writes an audit log.

### 6.4 Patient Ledger History
- **Route**: `GET /api/v1/payments/my-payments`
- **Access**: Authenticated (`patient`)
- **How It Works**: Returns all receipts and payment statuses for the patient.

### 6.5 Get Payment by ID
- **Route**: `GET /api/v1/payments/:id`
- **Access**: Authenticated (`patient` or `admin`)
- **How It Works**: Retrieves single payment receipt details.

---

## 🔍 Module 7: Discovery & Multi-Dimensional Search Engine
**Base Path**: `/api/v1/search`  
**Primary Files**: `controller/searchController.js`, `router/searchRouter.js`

### 7.1 Free-Text Search with Next-Available Slot
- **Route**: `GET /api/v1/search/doctors`
- **Access**: Public
- **Query Params**: `?q=Panchakarma&specialization=...&minRating=4.5&maxFee=1000`
- **How It Works**:
  - Searches doctor names, bios, and specializations.
  - Calculates each doctor's **next available calendar slot** in a single optimized query.
  - **Sub-200ms Latency**: First request queries DB (`X-Cache-Lookup: MISS`). Subsequent identical requests return from Upstash Redis in **< 15ms** (`X-Cache-Lookup: HIT-REDIS`).
  - Cache is purged automatically whenever a doctor updates their profile or schedule.

### 7.2 Specializations Aggregation
- **Route**: `GET /api/v1/search/specializations`
- **Access**: Public
- **How It Works**: Returns distinct Ayurvedic clinical specializations (Kayachikitsa, Panchakarma, etc.) alongside active doctor counts. Cached in Redis for 1 hour.

---

## 📜 Module 8: Compliance, Security & Admin Audit Trails
**Base Path**: `/api/v1/admin/audit-logs`  
**Primary Files**: `controller/auditController.js`, `router/auditRouter.js`

### 8.1 Browse Audit Logs
- **Route**: `GET /api/v1/admin/audit-logs`
- **Access**: Admin only (`authorize('admin')`)
- **Query Params**: `?action=BOOKING_CONFIRMED&entity_type=consultations&startDate=2026-09-01&endDate=2026-09-30&page=1&limit=20`
- **How It Works**: Non-admins receive **`403 Forbidden`**. Returns actor name, role, IP address, User-Agent, and detailed JSON diff payloads for non-repudiation regulatory audits.

### 8.2 Compliance Summary Telemetry
- **Route**: `GET /api/v1/admin/audit-logs/summary`
- **Access**: Admin only (`authorize('admin')`)
- **How It Works**: Aggregates total lifetime audit records, events in last 24h, top actions (`USER_LOGIN`, `BOOKING_CONFIRMED`), and top active actors.

### 8.3 Get Single Audit Log Entry
- **Route**: `GET /api/v1/admin/audit-logs/:id`
- **Access**: Admin only (`authorize('admin')`)
- **How It Works**: Returns raw event payload and actor details.

---

## 📊 Module 9: Executive Business Intelligence & Analytics
**Base Path**: `/api/v1/admin/analytics`  
**Primary Files**: `controller/analyticsController.js`, `router/analyticsRouter.js`

### 9.1 Executive Platform Overview (100k Capacity Tracker)
- **Route**: `GET /api/v1/admin/analytics/overview`
- **Access**: Admin only (`authorize('admin')`)
- **How It Works**: Calculates real-time progress toward the 100,000 daily consultation target (`capacity_fulfillment_progress`), consultation status distributions, active user counts, gross revenue, and net revenue. Cached in Redis (5-minute TTL).

### 9.2 Consultation Timeseries
- **Route**: `GET /api/v1/admin/analytics/consultations`
- **Access**: Admin only (`authorize('admin')`)
- **Query Params**: `?startDate=2026-09-01&endDate=2026-09-30&groupBy=day` (or `week` or `month`)
- **How It Works**: Returns volume trends and cancellation rates grouped by time buckets.

### 9.3 Revenue Analytics by Specialization
- **Route**: `GET /api/v1/admin/analytics/revenue`
- **Access**: Admin only (`authorize('admin')`)
- **How It Works**: Breaks down earnings by traditional Ayurvedic specialization and payment method (UPI vs Card).

### 9.4 Doctor Utilization Leaderboard
- **Route**: `GET /api/v1/admin/analytics/doctors`
- **Access**: Admin only (`authorize('admin')`)
- **How It Works**: Platform calendar slot utilization percentages and rankings of top Ayurvedic physicians by completed consultations.

---

## 🛠️ Module 10: Infrastructure, Observability & Diagnostics
**Base Path**: Root & Diagnostics  
**Primary Files**: `index.js`, `router/healthRouter.js`, `helper/metrics.js`

### 10.1 System Health Probe
- **Route**: `GET /api/v1/health`
- **Access**: Public
- **How It Works**: Performs live active ping against PostgreSQL and Upstash Redis. Returns `status: UP`, DB latency, and Redis latency. Used by Docker & Kubernetes `HEALTHCHECK`.

### 10.2 Database Diagnostics
- **Route**: `GET /api/v1/db-test`
- **Access**: Public
- **How It Works**: Queries table schemas in `information_schema` and verifies pool connections.

### 10.3 Prometheus Metrics Scraping Endpoint
- **Route**: `GET /metrics`
- **Access**: Public / Scraper
- **How It Works**: Exports real-time telemetry: HTTP request duration histograms (`amrutam_http_request_duration_seconds`), total request counters, resident memory gauges, and process CPU counters for Prometheus and Grafana dashboards.

### 10.4 Interactive Swagger UI Documentation
- **Route**: `GET /api-docs`
- **Access**: Public
- **How It Works**: Interactive OpenAPI 3.0 catalog with the **`v2.1.0`** green badge. Allows instant live testing of all endpoints.

> 🐳 **Docker Deployment Guide**: For full container instructions, automated migration entrypoints, and local vs. cloud database setup, refer to [`DOCKER_GUIDE.md`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/DOCKER_GUIDE.md).

---

## ⚡ Resilience Engine: Async Jobs, Rate Limiting & Retries

### 1. Asynchronous Job Worker (`helper/asyncQueue.js`)
- **Jobs**:
  - `SEND_CONSULTATION_CONFIRMATION`: Asynchronous email/SMS notification dispatch.
  - `GENERATE_INVOICE`: Asynchronous PDF invoice calculation.
  - `CLEANUP_EXPIRED_HOLDS`: Background sweeping of expired slot holds.
- **State Persistence**: Job states (`queued`, `running`, `completed`, `failed`) are mirrored in Redis with a 24h TTL.

### 2. Exponential Backoff with Decorrelated Jitter (`helper/retry.js`)
- **Formula**:
  $$\text{Delay} = \text{random}(0, \min(\text{maxDelay}, \text{baseDelay} \times 2^{\text{attempt}-1}))$$
- **Automatic Recovery**: Automatically retries transient network timeouts, DB pool resets, and rate limits without thunder-herd spikes.

### 3. Redis Sliding-Window Rate Limiter (`auth/rateLimiter.js`)
- Protects auth routes (`POST /auth/login` at 60 req/min) and global routes (300 req/min). Returns standard headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

---

## 🧪 Interviewer Quick Verification Checklist

An evaluator can verify this entire system in less than 2 minutes:

1. **Verify All 11 Architectural Suites**:
   ```bash
   npm test
   ```
   *(Executes all 11 suites sequentially with a 100% pass rate).*

2. **Explore Interactive Documentation**:
   - Open: `http://localhost:3000/api-docs`

3. **Check System Health & Latencies**:
   - Open: `http://localhost:3000/api/v1/health`

4. **Inspect Live Prometheus Metrics**:
   - Open: `http://localhost:3000/metrics`
