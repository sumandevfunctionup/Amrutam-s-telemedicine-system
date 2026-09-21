# Amrutam Telemedicine System — Backend API

> **Enterprise-grade Telemedicine Platform Backend**  
> Engineered for **100,000 daily consultations**, sub-200ms read latencies, zero double-booking concurrency guarantees, automated Saga rollbacks, and non-repudiation audit trails.

---

## 🛠 Tech Stack

- **Runtime**: Node.js v20+ / v22+ (ECMAScript Modules `type: module`)
- **Web Framework**: Express.js 4.x
- **Primary Database**: PostgreSQL 16/18 with Knex.js SQL query builder and connection pooler
- **Distributed Cache & Mutex**: Upstash Redis via `@upstash/redis` (HTTPS REST Protocol)
- **Validation**: Zod schema validation middleware
- **Security**: JWT (Access + Refresh tokens), TOTP Multi-Factor Authentication (RFC 6238), Bcrypt (cost 12), Helmet, Write Idempotency Middleware, Token Blacklist
- **Telemetry & Observability**: Prometheus scraping (`/metrics` via `prom-client`), Correlation IDs (`X-Correlation-ID`), structured logging
- **Documentation**: Swagger UI / OpenAPI 3.0 (`/api-docs` and `/api-docs.json`)
- **Containerization & CI/CD**: Docker (multi-stage Alpine image), Docker Compose, GitHub Actions

---

## 📁 Repository Architecture

```text
Amrutam-s-telemedicine-system/
├── auth/                      # Authentication & authorization middlewares
│   ├── middleware.js          # JWT verification, RBAC, Idempotency filter, token blacklist
│   └── rateLimiter.js         # Redis-backed sliding-window rate limiter
├── controller/                # Request controllers & business logic
│   ├── analyticsController.js # Module 9: Executive KPIs, timeseries, revenue & utilization
│   ├── auditController.js     # Module 8: Compliance audit log browser & summaries
│   ├── authController.js      # Module 1: Registration, login, MFA, logout (blacklist)
│   ├── bookingController.js   # Module 3: Concurrency engine, distributed locks & booking
│   ├── consultationController.js # Module 4: Consultation state machine & SOAP clinical notes
│   ├── doctorController.js    # Module 2: Doctor profiles & calendar availability slots
│   ├── healthController.js    # Diagnostics, PostgreSQL & Redis health probes
│   ├── paymentController.js   # Module 6: Payment checkout, webhooks & Saga rollbacks
│   ├── prescriptionController.js # Module 5: Digital prescriptions & EHR history
│   └── searchController.js    # Module 7: Sub-200ms search engine & category aggregates
├── db/                        # Database connectivity, migrations & seeds
│   ├── db.js                  # Knex initialization & connection pool
│   ├── migrations/            # Version-controlled schema migrations
│   └── seeds/                 # Initial seed dataset (Admin, Doctors, Patients, Slots)
├── helper/                    # Cross-cutting utilities & helpers
│   ├── apiResponse.js         # Standardized semantic HTTP API responses
│   ├── correlation.js         # Distributed request tracing (X-Correlation-ID)
│   ├── date.js                # UTC date/time formatting (yyyy-mm-dd hh:mm:ss)
│   ├── jwt.js                 # JWT issuance, verification & refresh tokens
│   ├── metrics.js             # Prometheus metrics engine (GET /metrics)
│   ├── mfa.js                 # RFC 6238 TOTP secrets & QR generation
│   ├── password.js            # Bcrypt hashing & verification
│   ├── redis.js               # Resilient Upstash Redis client (cache, lock, blacklist)
│   ├── schemas.js             # Centralized Zod validation schemas
│   ├── swagger.js             # OpenAPI 3.0 specification generator
│   └── validator.js           # Zod schema validation middleware
├── router/                    # Express routing layer
│   ├── analyticsRouter.js     # /api/v1/admin/analytics routes
│   ├── auditRouter.js         # /api/v1/admin/audit-logs routes
│   ├── authRouter.js          # /api/v1/auth routes
│   ├── bookingRouter.js       # /api/v1/bookings routes
│   ├── consultationRouter.js  # /api/v1/consultations routes
│   ├── doctorRouter.js        # /api/v1/doctors routes
│   ├── healthRouter.js        # Health and DB test routes
│   ├── indexRouter.js         # Central API router (/api/v1)
│   ├── paymentRouter.js       # /api/v1/payments routes
│   ├── prescriptionRouter.js  # /api/v1/prescriptions routes
│   └── searchRouter.js        # /api/v1/search routes
├── test/                      # Automated end-to-end integration test suites
│   ├── run_all_tests.js       # Master sequential test runner (npm test)
│   ├── test_module1_auth.js   # Module 1: Auth, RBAC, MFA & Token Blacklisting
│   ├── test_module2.js        # Module 2: Doctor profiles & availability slots
│   ├── test_module3.js        # Module 3: Concurrency race & locking verification
│   ├── test_module4.js        # Module 4: Consultation lifecycle & SOAP clinical notes
│   ├── test_module5.js        # Module 5: Digital prescriptions & longitudinal EHR
│   ├── test_module6.js        # Module 6: Payment Saga & compensating rollback
│   ├── test_redis_integration.js # Module 7: Full-system Redis caching, locking & search
│   ├── test_module8.js        # Module 8: Compliance audit trail & RBAC verification
│   ├── test_module9.js        # Module 9: Executive analytics & timeseries verification
│   ├── test_module10.js       # Module 10: Observability, Prometheus, Docker & CI/CD
│   └── test_rate_limit_and_async.js # Resilience: Rate limiting, exponential retry & jobs
├── .github/workflows/ci.yml   # GitHub Actions CI/CD matrix pipeline
├── ARCHITECTURE.md            # Master 2–4 page architecture & scalability document
├── BLUEPRINT.md               # Master engineering blueprint & PRD matrix
├── DEMO_SCRIPT.md             # 5-minute video submission walkthrough script
├── DOCKER_GUIDE.md            # Comprehensive Docker deployment & execution guide
├── MODULES_AND_APIS_GUIDE.md  # Step-by-step module & API evaluation guide
├── REDIS_DOCUMENTATION.md     # Authoritative Redis architecture & operational guide
├── Dockerfile                 # Multi-stage production container build
├── docker-compose.yml         # Container orchestration manifest
├── docker-entrypoint.sh       # Automated container migration entrypoint
├── index.js                   # Application entry point
├── package.json
└── README.md
```

---

## 📌 Evaluator Quick Reference & Guides
- 📖 **[Modules & Complete API Evaluation Guide](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/MODULES_AND_APIS_GUIDE.md)**: Deep dive into all 10 modules, endpoints, request/response bodies, business logic, and security rules.
- 🐳 **[Docker Deployment & Operations Guide](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/DOCKER_GUIDE.md)**: Step-by-step walkthrough to build, configure `.env`, and launch using Docker and Docker Compose.
- 📐 **[Master Architecture Document](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/ARCHITECTURE.md)**: Concurrency models, two-tier distributed mutex, database ERD, and threat models.
- 🎥 **[5-Minute Video Presentation Script](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/DEMO_SCRIPT.md)**: Minute-by-minute presenter walkthrough.
- ⚡ **[Redis Architecture & Operational Guide](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/REDIS_DOCUMENTATION.md)**: Upstash HTTPS REST caching, distributed locking, and token revocation.

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- Node.js v20+ or v22+
- Cloud PostgreSQL connection string (Neon / AWS RDS / Local PostgreSQL)
- Upstash Redis credentials (`UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`)

### 2. Installation
```bash
git clone <repo-url>
cd Amrutam-s-telemedicine-system
npm install
```

### 3. Environment Variables
Configure your `.env` file:
```env
PORT=3000
NODE_ENV=development

# Database Configuration
DB_CONNECTION_STRING="postgresql://<user>:<password>@<host>/<database>?sslmode=require"

# JWT Secrets
JWT_SECRET="amrutam_telemedicine_jwt_super_secret_key_2026"
JWT_REFRESH_SECRET="amrutam_telemedicine_jwt_refresh_super_secret_key_2026"
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
MFA_APP_NAME="Amrutam Telemedicine"

# Redis Configuration (Upstash HTTPS REST)
UPSTASH_REDIS_REST_URL="https://<your-instance>.upstash.io"
UPSTASH_REDIS_REST_TOKEN="<your-token>"
```

### 4. Database Migrations & Seeds
Run database schema migrations and populate initial seed data (Admin, Doctors, Patients, Slots):
```bash
npm run migrate
npm run seed
```

### 5. Running the Application
```bash
# Start development server with Nodemon
npm run dev

# Start production server
npm start
```

Server endpoints will be active at:
- **Base URL**: `http://localhost:3000`
- **Swagger Documentation**: `http://localhost:3000/api-docs`
- **OpenAPI JSON**: `http://localhost:3000/api-docs.json`
- **System Health Check**: `http://localhost:3000/api/v1/health`
- **Prometheus Metrics**: `http://localhost:3000/metrics`

---

## 🐳 Docker Deployment

The application includes a production-ready, multi-stage [`Dockerfile`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Dockerfile) and a self-contained [`docker-compose.yml`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/docker-compose.yml) that automatically applies database migrations upon container startup.

### Option 1: Instant Zero-Configuration Launch (Local Postgres + API)
If you don't have external cloud accounts, Docker Compose spins up an isolated PostgreSQL 16 container, automatically applies migrations, and launches the API:

```bash
# Build and start all services (PostgreSQL + API)
docker compose up --build

# Populate initial seed data (Admin, Doctors, Patients, Slots)
docker compose exec api npm run seed
```

### Option 2: Launch with Cloud PostgreSQL & Upstash Redis
If you have cloud database and Redis credentials:

```bash
# 1. Create .env from template
cp .env.example .env

# 2. Add your cloud credentials to .env:
#    DB_CONNECTION_STRING="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
#    UPSTASH_REDIS_REST_URL="https://<your-instance>.upstash.io"
#    UPSTASH_REDIS_REST_TOKEN="<your-token>"

# 3. Start containers (connects to your cloud services)
docker compose up --build
```

### Option 3: Standalone Docker Run
```bash
# Build production image
docker build -t amrutam/telemedicine-api:latest .

# Run with environment variables
docker run -d -p 3000:3000 --env-file .env --name amrutam_api amrutam/telemedicine-api:latest
```

---

## 📡 API Endpoint Catalog

### Authentication & Users (Module 1)
- `POST /api/v1/auth/register` — Register a new patient or doctor
- `POST /api/v1/auth/login` — Login with email/password (supports MFA challenges)
- `POST /api/v1/auth/mfa/setup` — Generate TOTP MFA secret and QR code
- `POST /api/v1/auth/mfa/verify` — Verify TOTP code during login
- `POST /api/v1/auth/mfa/confirm` — Confirm and activate MFA
- `POST /api/v1/auth/refresh-token` — Issue new short-lived access token
- `POST /api/v1/auth/logout` — Revoke token immediately via Redis blacklist
- `GET  /api/v1/auth/me` — Get authenticated user profile (Redis accelerated)
- `PUT  /api/v1/auth/profile` — Update user profile details

### Doctor Profiles & Slots (Module 2)
- `GET    /api/v1/doctors` — List verified doctors with filtering and pagination (cached)
- `GET    /api/v1/doctors/:id` — Public doctor profile (cached)
- `PUT    /api/v1/doctors/profile` — Doctor updates bio, fee, experience (auto-cache invalidation)
- `POST   /api/v1/doctors/slots` — Batch create availability slots (overlap validation)
- `GET    /api/v1/doctors/:doctorId/slots` — List available slots for calendar view (cached)
- `DELETE /api/v1/doctors/slots/:slotId` — Cancel an unbooked availability slot

### Concurrency-Safe Booking Engine (Module 3)
- `POST /api/v1/bookings/lock` — Acquire 10-minute hold on a slot (Redis distributed mutex + DB row lock)
- `POST /api/v1/bookings/confirm` — Finalize booking, schedule consultation & create payment intent
- `POST /api/v1/bookings/cancel` — Cancel booking or release held slot
- `GET  /api/v1/bookings/my-bookings` — List user's consultation bookings

### Consultation Lifecycle & SOAP Notes (Module 4)
- `GET   /api/v1/consultations` — List consultations with pagination and status filters
- `GET   /api/v1/consultations/:id` — Consultation details & video room link
- `PATCH /api/v1/consultations/:id/start` — Transition consultation to `in_progress`
- `PATCH /api/v1/consultations/:id/complete` — Transition consultation to `completed`
- `PATCH /api/v1/consultations/:id/cancel` — Cancel consultation with audit reason
- `PATCH /api/v1/consultations/:id/notes` — Record Ayurvedic SOAP clinical notes

### Digital Prescriptions & EHR (Module 5)
- `POST /api/v1/consultations/:id/prescription` — Doctor issues legally immutable prescription
- `GET  /api/v1/consultations/:id/prescription` — Fetch prescription for a consultation
- `GET  /api/v1/prescriptions/:id` — Fetch prescription details by ID
- `GET  /api/v1/prescriptions/patient/:patientId` — Patient longitudinal EHR history (PHI protected)

### Payment Processing & Saga Ledger (Module 6)
- `POST /api/v1/payments/initiate` — Generate payment checkout order with 15-minute expiration
- `POST /api/v1/payments/webhook` — Idempotent payment gateway webhook handler (Saga rollback on failure)
- `POST /api/v1/payments/:id/refund` — Process refund and restore calendar availability
- `GET  /api/v1/payments/my-payments` — User financial transaction ledger
- `GET  /api/v1/payments/:id` — Detailed payment record

### Search & Discovery Engine (Module 7)
- `GET /api/v1/search/doctors` — Multi-dimensional doctor search (sub-200ms SLAs, batch next-slot)
- `GET /api/v1/search/specializations` — Aggregated Ayurvedic specialties and fee statistics

### Compliance & Admin Audit Trails (Module 8)
- `GET /api/v1/admin/audit-logs` — Browse and filter audit logs by action, entity, user, date (Admin only)
- `GET /api/v1/admin/audit-logs/summary` — Compliance telemetry, action breakdowns & top actors
- `GET /api/v1/admin/audit-logs/:id` — Inspect individual audit log non-repudiation details

### Admin Analytics & Platform Intelligence (Module 9)
- `GET /api/v1/admin/analytics/overview` — Executive KPIs, 100k daily capacity progress, revenue metrics
- `GET /api/v1/admin/analytics/consultations` — Consultation volume timeseries trends
- `GET /api/v1/admin/analytics/revenue` — Financial revenue grouped by specialty & payment method
- `GET /api/v1/admin/analytics/doctors` — Doctor capacity utilization percentages & rankings

### Observability & Metrics (Module 10)
- `GET /metrics` — Prometheus telemetry scraper (Node.js runtime, HTTP duration histograms, counters)
- `GET /api/v1/health` — Comprehensive system, PostgreSQL, and Upstash Redis health probe
- `GET /api/v1/db-test` — Live database connectivity and version diagnostics

---

## 🧪 Automated Verification Test Suites

### Master Test Suite Runner (`npm test`)
Execute all 11 architectural test suites sequentially with automated ASCII summary reporting:

```bash
npm test
```

### Video Submission Guide
- For a minute-by-minute presenter guide for the 5-minute video recording, see [`DEMO_SCRIPT.md`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/DEMO_SCRIPT.md).

### Individual Module Verification Scripts
Individual test suites can also be executed standalone:

```bash
# Module 1: Auth, RBAC, MFA & Token Blacklisting
node test/test_module1_auth.js

# Module 2: Doctor Profiles & Slots
node test/test_module2.js

# Module 3: Concurrency Engine & Locking
node test/test_module3.js

# Module 4: Consultation Lifecycle & Notes
node test/test_module4.js

# Module 5: Digital Prescriptions & EHR
node test/test_module5.js

# Module 6: Payments & Saga Compensating Actions
node test/test_module6.js

# Full-System Redis Caching, Mutex & Blacklisting
node test/test_redis_integration.js

# Module 8: Compliance & Admin Audit Trails
node test/test_module8.js

# Module 9: Admin Analytics & Intelligence
node test/test_module9.js

# Module 10: Observability, Prometheus & Docker Manifests
node test/test_module10.js

# Async Tasks, Rate Limiting & Exponential Retry
node test/test_rate_limit_and_async.js
```

---

## 🔒 Security & Architecture Standards
- **Zero Double-Bookings**: Guaranteed via Redis distributed mutex + PostgreSQL `FOR UPDATE` row locks.
- **UTC Time Standard**: All date/time automated fields are formatted strictly in UTC as `yyyy-mm-dd hh:mm:ss`.
- **Stateless Revocation**: JWTs invalidated immediately upon logout via in-memory Redis blacklist.
- **Circuit Breaking**: Redis failures gracefully fall back to PostgreSQL with zero service disruption.
- Detailed architecture and scaling analyses are documented in [`ARCHITECTURE.md`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/ARCHITECTURE.md).
