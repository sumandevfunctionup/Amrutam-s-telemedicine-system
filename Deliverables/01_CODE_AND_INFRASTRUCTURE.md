# 📦 Deliverable 1: Git Repository, Code Architecture & Infrastructure

> **PRD Deliverable #1**: Git repo with code and infra  
> **Repository**: [https://github.com/sumandevfunctionup/Amrutam-s-telemedicine-system.git](https://github.com/sumandevfunctionup/Amrutam-s-telemedicine-system.git)  
> **Release Version**: `v2.1.0`  
> **Branch**: `main`

---

## 1. Codebase Architecture

The application is structured as an enterprise-grade modular Node.js ECMAScript Modules (`type: module`) Express service:

```text
Amrutam-s-telemedicine-system/
├── auth/                      # Security, JWT, RBAC & Sliding-window rate limiters
│   ├── middleware.js          # Authentication, role verification, token blacklist
│   └── rateLimiter.js         # Redis-backed sliding-window rate limiting
├── controller/                # 10 Core Application Modules Controllers
│   ├── analyticsController.js # Module 9: Executive BI, timeseries, doctor utilization
│   ├── auditController.js     # Module 8: Compliance non-repudiation audit trails
│   ├── authController.js      # Module 1: Registration, login, MFA, token refresh
│   ├── bookingController.js   # Module 3: Concurrency engine, distributed locks & bookings
│   ├── consultationController.js # Module 4: 5-state machine & Ayurvedic SOAP notes
│   ├── doctorController.js    # Module 2: Doctor profiles & availability slots
│   ├── healthController.js    # Diagnostics, PostgreSQL & Redis health probes
│   ├── paymentController.js   # Module 6: Payment Saga ledger & compensating rollbacks
│   ├── prescriptionController.js # Module 5: Immutable digital prescriptions & EHR
│   └── searchController.js    # Module 7: Multi-dimensional sub-200ms discovery engine
├── db/                        # Database connectivity, migrations & seeds
│   ├── db.js                  # Knex connection pooling (min: 2, max: 20)
│   ├── migrations/            # Versioned SQL migrations (Knex)
│   └── seeds/                 # Seed dataset (Admin, Doctors, Patients, Slots)
├── helper/                    # Cross-cutting enterprise utilities
│   ├── apiResponse.js         # Standardized semantic HTTP API envelope
│   ├── asyncQueue.js          # In-memory background task worker pool
│   ├── correlation.js         # Distributed request tracing (X-Correlation-ID)
│   ├── date.js                # Universal UTC date/time formatting (yyyy-mm-dd hh:mm:ss)
│   ├── jwt.js                 # JWT issuance, verification & refresh tokens
│   ├── metrics.js             # Prometheus telemetry scraper (/metrics)
│   ├── mfa.js                 # RFC 6238 TOTP secrets & QR generation
│   ├── redis.js               # Resilient Upstash Redis client (cache, lock, blacklist)
│   ├── retry.js               # Exponential backoff with decorrelated full jitter
│   ├── schemas.js             # Centralized Zod validation schemas
│   └── swagger.js             # OpenAPI 3.0 specification generator
├── router/                    # Express routing layer
│   ├── analyticsRouter.js     # /api/v1/admin/analytics
│   ├── auditRouter.js         # /api/v1/admin/audit-logs
│   ├── authRouter.js          # /api/v1/auth
│   ├── bookingRouter.js       # /api/v1/bookings
│   ├── consultationRouter.js  # /api/v1/consultations
│   ├── doctorRouter.js        # /api/v1/doctors
│   ├── healthRouter.js        # /api/v1/health & /api/v1/db-test
│   ├── indexRouter.js         # Central API v1 multiplexer
│   ├── paymentRouter.js       # /api/v1/payments
│   ├── prescriptionRouter.js  # /api/v1/prescriptions
│   └── searchRouter.js        # /api/v1/search
├── test/                      # 11 Automated integration test suites
│   ├── run_all_tests.js       # Master sequential test runner
│   └── test_*.js              # Individual module test suites
├── Dockerfile                 # Multi-stage production container build
├── docker-compose.yml         # Container orchestration manifest
└── docker-entrypoint.sh       # Automated migration startup entrypoint
```

---

## 2. Infrastructure as Code (IaC)

### 2.1 Multi-Stage Docker Build (`Dockerfile`)
- **Stage 1 (Builder)**: Uses `node:22-alpine` with native build tools (`make`, `g++`, `python3`) and installs dependencies via `npm ci --omit=dev`.
- **Stage 2 (Runner)**: Copies only runtime artifacts into a clean `node:22-alpine` image to minimize CVE surface area.
- **Security Constraint**: Executes under non-root unprivileged `USER node` (UID 1000).
- **Native Healthcheck**: Regular probe against `http://localhost:3000/api/v1/health` with a 30s interval.

### 2.2 Container Orchestration (`docker-compose.yml`)
- Orchestrates the Express API and an isolated local PostgreSQL 16 container (`postgres:16-alpine`).
- Automatic environment variable fallback and network bridging.
- Zero-config deployment: can use bundled PostgreSQL or connect to cloud serverless Neon DB via `.env`.

### 2.3 Automated Startup Entrypoint (`docker-entrypoint.sh`)
- Intercepts container boot and executes `npm run migrate` before starting `node index.js`.
- Guarantees schema consistency and eliminates manual migration steps during deployments.
- Passes POSIX signals (`SIGTERM`, `SIGINT`) directly to Node.js for graceful shutdowns.

---

## 3. Git Repository Standard

- **Branching**: `main` is production-ready and passes all CI/CD workflows.
- **Conventional Commits**: Clean commit history adhering to standard semantic tags (`feat`, `fix`, `docs`, `chore`).
- **Secret Hygiene**: `.env` is permanently excluded via `.gitignore`; credentials are provided through documented template `.env.example`.
