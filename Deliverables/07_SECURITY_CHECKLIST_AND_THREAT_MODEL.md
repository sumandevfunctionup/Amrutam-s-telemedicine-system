# 🛡️ Deliverable 7: Security Checklist & Threat Model

> **PRD Deliverable #7**: Security checklist and threat model  
> **Compliance Standard**: HIPAA / DISHA Healthcare Data Guidelines & OWASP Top 10 (2021)  
> **Primary Source**: Section 6 of [`ARCHITECTURE.md`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/ARCHITECTURE.md)

---

## 1. OWASP Top 10 Defensive Implementation Matrix

| OWASP Vulnerability | Threat Description | Amrutam Defensive Control | Enforcement File |
|---|---|---|---|
| **A01: Broken Access Control** | Unauthorized users accessing clinical records or administrative endpoints. | • Role-Based Access Control (RBAC) middleware verifying roles (`patient`, `doctor`, `admin`).<br>• Object-level ownership validation on consultations and prescriptions.<br>• Unmatched access attempts rejected with `403 Forbidden`. | `auth/middleware.js` |
| **A02: Cryptographic Failures** | Compromised credentials or exposed transit data. | • Passwords hashed with **bcrypt** (cost factor 12).<br>• Short-lived JWT Access Tokens (15 min) + Refresh Tokens (7 days).<br>• Enforced TLS 1.3 in transit with `sslmode=require`. | `helper/password.js`<br>`helper/jwt.js` |
| **A03: Injection** | SQL injection targeting database schemas. | • 100% parameterized SQL queries via Knex query builder.<br>• Zero raw string SQL concatenation.<br>• Strict runtime payload validation via Zod schemas. | `helper/schemas.js`<br>`db/db.js` |
| **A04: Insecure Design** | Double-booking slots and duplicate financial charges. | • Two-tier distributed locking (Redis atomic lock `NX EX 600` + PostgreSQL `FOR UPDATE`).<br>• Write idempotency filter (`Idempotency-Key` header cached in Redis).<br>• Choreographed Saga compensating rollbacks. | `controller/bookingController.js`<br>`auth/middleware.js` |
| **A05: Security Misconfiguration** | Default configurations, exposed headers, running as root. | • **Helmet** security headers (HSTS, X-Content-Type-Options, X-Frame-Options: DENY).<br>• Multi-stage Docker execution under unprivileged non-root `USER node` (UID 1000).<br>• CORS whitelist restricted to trusted domains. | `index.js`<br>`Dockerfile` |
| **A06: Vulnerable Components** | Vulnerabilities in open-source third-party dependencies. | • Automated dependency scanning in GitHub Actions CI (`npm audit --audit-level=high`).<br>• Lockfile integrity enforcement via `npm ci --omit=dev`. | `.github/workflows/ci.yml` |
| **A07: Auth & Identification Failures** | Credential stuffing, brute force, token reuse after logout. | • **Multi-Factor Authentication (MFA)** via RFC 6238 TOTP.<br>• Sliding-window rate limiting on login (60 req/min).<br>• Instant token revocation via Upstash Redis blacklist upon logout (`POST /auth/logout`). | `helper/mfa.js`<br>`auth/rateLimiter.js` |
| **A08: Software & Data Integrity** | Alteration of medical prescriptions after consultation. | • Digital prescriptions are **legally immutable** once signed.<br>• Attempted modifications return `409 Conflict`.<br>• Tamper-evident transaction logs. | `controller/prescriptionController.js` |
| **A09: Security Logging & Monitoring** | Undetected breaches or repudiation of medical actions. | • Append-only non-repudiation `audit_logs` table capturing `user_id`, `action`, `entity_type`, `ip_address`, `user_agent`, and state diffs.<br>• Ingress correlation IDs (`X-Correlation-ID`) across all request logs. | `controller/auditController.js`<br>`helper/correlation.js` |

---

## 2. Threat Modeling & Attack Surface Analysis

```mermaid
graph TD
    Attacker[External Threat Actor]
    
    subgraph Vectors
        Attacker -->|Vector 1: Brute Force & Credential Stuffing| IngressAuth[Public Ingress /auth/login]
        Attacker -->|Vector 2: IDOR / BOLA| ClinicalAPI[Clinical Records /consultations /prescriptions]
        Attacker -->|Vector 3: Concurrency Race / Scalping| BookingEngine[Slot Reservation /bookings/lock]
        Attacker -->|Vector 4: Webhook Replay / Forgery| PaymentGateway[Gateway Webhook /payments/webhook]
    end

    subgraph Defenses
        IngressAuth --> RL[Redis Sliding-Window Rate Limiter 60 req/min + TOTP MFA]
        ClinicalAPI --> Ownership[RBAC Ownership Guard 403 Forbidden]
        BookingEngine --> TwoTierLock[Redis Mutex NX EX + Postgres FOR UPDATE]
        PaymentGateway --> Idempotency[DB Transaction Idempotency Filter]
    end
```

### Detailed Threat Scenarios & Mitigations:

#### Threat 1: Credential Stuffing & Brute-Force Attacks
- **Target**: `POST /api/v1/auth/login`
- **Mitigation**:
  1. Redis sliding-window rate limiter restricts attempts to 60 req/minute per IP.
  2. RFC 6238 Time-based One-Time Password (TOTP) requires second-factor authorization.
  3. Bcrypt cost factor 12 introduces computational friction against offline dictionary attacks.

#### Threat 2: Broken Object-Level Authorization (BOLA / IDOR)
- **Target**: `GET /api/v1/prescriptions/patient/:id/ehr` and `GET /api/v1/consultations/:id`
- **Mitigation**:
  1. Strict authorization middleware inspects `req.user.id` and `req.user.role`.
  2. Patients can only query their own health records (`req.user.id === requested_patient_id`).
  3. Doctors can only query records of patients with whom they have an active or completed consultation.
  4. Cross-tenant queries are blocked with `403 Forbidden`.

#### Threat 3: Concurrency Race Condition (Slot Scalping & Double Booking)
- **Target**: `POST /api/v1/bookings/lock` and `POST /api/v1/bookings/confirm`
- **Mitigation**:
  1. Tier 1: Redis atomic lock (`SET amrutam:lock:slot:{id} {user_id} NX EX 600`) rejects concurrent contenders in < 5ms with `409 Conflict`.
  2. Tier 2: PostgreSQL pessimistic lock (`SELECT ... FOR UPDATE`) guarantees optimistic version incrementation inside an atomic transaction.

#### Threat 4: Replay Attacks & Duplicate Charges
- **Target**: `POST /api/v1/payments/checkout` and `POST /api/v1/payments/webhook`
- **Mitigation**:
  1. Ingress requests require an `Idempotency-Key` header.
  2. The key and response payload are cached in Redis for 24 hours. Duplicate submissions immediately replay the cached response with `X-Cache: IDEMPOTENT-HIT`.
  3. Gateway webhook transactions verify current status before transitioning, ensuring idempotency.

---

## 3. Data Classification Matrix (PII vs. PHI vs. Financial)

| Data Category | Data Elements Included | Classification Level | Storage & Handling Controls |
|---|---|:---:|---|
| **Personally Identifiable Information (PII)** | • First name, last name<br>• Email address, phone number<br>• Physical postal address | **Confidential** | • Encrypted in transit (TLS 1.3).<br>• Restricted access by RBAC.<br>• Masked in general application logs. |
| **Protected Health Information (PHI)** | • Ayurvedic Dosha diagnosis (Prakriti, Vikriti)<br>• Nadi pulse examination notes<br>• Medical SOAP notes<br>• Herbal prescriptions & dietary guidance | **Strictly Confidential** | • Accessible only by licensed doctor and patient owner.<br>• Legally immutable once consultation completes.<br>• Excluded from marketing/analytics data exports.<br>• Stored with append-only audit trail logging. |
| **Financial Ledger Data** | • Payment transaction IDs<br>• Consultation fees<br>• Refund records<br>• Payment status | **Sensitive** | • Stored in append-only financial ledger.<br>• Credit card PAN/CVV never touch Amrutam servers (handled directly by PCI-DSS compliant gateway). |

---

## 4. Key Rotation & Supply-Chain Security Protocols

1. **Dual-Key JWT Rotation**:
   - The auth verification layer supports dual-key decoding: an active primary key (`JWT_SECRET`) and a fallback transition key (`JWT_SECRET_PREVIOUS`), allowing seamless secret rotation without logging out active users.
2. **Zero Hardcoded Secrets**:
   - Zero credentials or tokens are committed to source control.
   - All runtime variables (`DB_CONNECTION_STRING`, `UPSTASH_REDIS_REST_URL`, `JWT_SECRET`) are injected via Docker Compose or container orchestrator environment secrets.
3. **Automated Supply-Chain Scanning**:
   - Continuous dependency vulnerability scanning via `npm audit --audit-level=high` integrated into every pull request in GitHub Actions.
