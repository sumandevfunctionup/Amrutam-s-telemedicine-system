# 📜 Deliverable 3: OpenAPI 3.0 Specification & Interactive Schema

> **PRD Deliverable #3**: OpenAPI / Swagger schema  
> **Interactive Documentation**: `http://localhost:3000/api-docs`  
> **Raw OpenAPI 3.0 JSON**: `http://localhost:3000/api-docs.json`  
> **Static Schema Artifact**: [`Deliverables/openapi_v2.1.0.json`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/openapi_v2.1.0.json)  
> **Active API Version**: `v2.1.0`

---

## 1. Specification Overview

The Amrutam Telemedicine Backend implements an **OpenAPI 3.0** compliant specification automatically generated via `swagger-jsdoc` from route annotations and centralized Zod schemas (`helper/schemas.js`).

### Core Features:
- **Interactive Swagger UI**: Served directly by the Express app at `/api-docs` featuring custom emerald styling and an active version stamp badge (`v2.1.0`).
- **One-Click Try-It-Out**: Enables immediate execution of API calls directly within the browser, including Bearer token authentication.
- **Strict Input/Output Modeling**: Every parameter, JSON body, and HTTP response code (`200`, `201`, `400`, `401`, `403`, `409`, `429`, `500`) is fully typed.
- **Offline Import Ready**: A static snapshot is stored at [`Deliverables/openapi_v2.1.0.json`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/openapi_v2.1.0.json) for instant drag-and-drop into Postman, Insomnia, or Swagger Editor.

---

## 2. API Endpoint Catalog by Module Tag

### 🔐 1. Authentication & RBAC (`/api/v1/auth`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/v1/auth/register` | Register a new patient or doctor account | Public |
| `POST` | `/api/v1/auth/login` | Authenticate with email/password (returns MFA challenge if enabled) | Public |
| `POST` | `/api/v1/auth/login/mfa` | Complete login by providing 6-digit TOTP code | Public (Temp Token) |
| `POST` | `/api/v1/auth/mfa/setup` | Generate TOTP secret and QR code URI | Bearer |
| `POST` | `/api/v1/auth/mfa/confirm` | Confirm and activate TOTP MFA | Bearer |
| `POST` | `/api/v1/auth/refresh-token` | Issue new short-lived access token using refresh token | Public (Refresh Token) |
| `POST` | `/api/v1/auth/logout` | Revoke active access token via Redis blacklist | Bearer |
| `GET` | `/api/v1/auth/me` | Fetch authenticated profile (Redis accelerated) | Bearer |
| `PUT` | `/api/v1/auth/profile` | Update personal profile information | Bearer |

### 🩺 2. Doctors & Availability Engine (`/api/v1/doctors`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `GET` | `/api/v1/doctors` | List verified doctors with filtering and pagination | Public (Cached) |
| `GET` | `/api/v1/doctors/:id` | Retrieve detailed doctor profile | Public (Cached) |
| `PUT` | `/api/v1/doctors/profile` | Doctor updates professional bio, fee, experience | Doctor |
| `POST` | `/api/v1/doctors/slots` | Create availability slots with overlap prevention | Doctor |
| `GET` | `/api/v1/doctors/:id/slots` | Query doctor availability slots by date range | Public (Cached) |

### ⚡ 3. Concurrency Booking Engine (`/api/v1/bookings`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/v1/bookings/lock` | Acquire 10-minute atomic distributed hold on a slot | Patient |
| `POST` | `/api/v1/bookings/confirm` | Finalize booking, generate consultation, transition slot | Patient |
| `POST` | `/api/v1/bookings/release` | Manually release slot hold | Patient |

### 📋 4. Consultation Lifecycle & SOAP Notes (`/api/v1/consultations`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `GET` | `/api/v1/consultations/:id` | Fetch consultation details and current status | Patient / Doctor / Admin |
| `POST` | `/api/v1/consultations/:id/start` | Transition status from `scheduled` to `in_progress` | Doctor |
| `POST` | `/api/v1/consultations/:id/complete` | Transition status from `in_progress` to `completed` | Doctor |
| `POST` | `/api/v1/consultations/:id/cancel` | Cancel consultation and release slot inventory | Patient / Doctor / Admin |
| `POST` | `/api/v1/consultations/:id/soap-notes` | Record Ayurvedic SOAP notes (Prakriti, Vikriti, Agni) | Doctor |
| `GET` | `/api/v1/consultations/:id/soap-notes` | Retrieve clinical SOAP notes | Patient / Doctor |

### 💊 5. Digital Prescriptions & Longitudinal EHR (`/api/v1/prescriptions`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/v1/prescriptions` | Issue legally immutable digital prescription | Doctor |
| `GET` | `/api/v1/prescriptions/:id` | Fetch prescription details and herbal items | Patient / Doctor |
| `GET` | `/api/v1/prescriptions/patient/:patient_id/ehr` | Retrieve longitudinal chronological patient EHR | Patient (Self) / Doctor |

### 💳 6. Transactional Payments & Saga Ledger (`/api/v1/payments`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/v1/payments/checkout` | Initiate checkout transaction for a consultation | Patient |
| `POST` | `/api/v1/payments/webhook` | Process gateway webhooks (triggers compensating actions) | Public (Webhook Signature) |
| `POST` | `/api/v1/payments/:id/refund` | Admin initiates consultation refund | Admin |
| `GET` | `/api/v1/payments/my-payments` | Patient retrieves payment transaction history | Patient |
| `GET` | `/api/v1/payments/:id` | Fetch transaction details and ledger status | Patient / Admin |

### 🔍 7. Multi-Dimensional Search & Discovery (`/api/v1/search`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `GET` | `/api/v1/search/doctors` | Search doctors by query, specialty, fee, rating | Public (Cached) |
| `GET` | `/api/v1/search/specializations` | Retrieve list of active Ayurvedic specializations | Public (Cached) |

### 🛡️ 8. Compliance & Audit Trails (`/api/v1/admin/audit-logs`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `GET` | `/api/v1/admin/audit-logs` | Filter non-repudiation audit trail logs | Admin |
| `GET` | `/api/v1/admin/audit-logs/summary` | Query audit log summary and statistics | Admin |
| `GET` | `/api/v1/admin/audit-logs/:id` | Fetch specific audit log with diff payload | Admin |

### 📊 9. Analytics & Business Intelligence (`/api/v1/admin/analytics`)
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `GET` | `/api/v1/admin/analytics/overview` | Platform high-level KPIs (Consultations, Revenue, MRR) | Admin |
| `GET` | `/api/v1/admin/analytics/consultations` | Daily/weekly timeseries consultation volume | Admin |
| `GET` | `/api/v1/admin/analytics/revenue` | Revenue timeseries broken down by payment status | Admin |
| `GET` | `/api/v1/admin/analytics/doctors` | Doctor utilization metrics and consultation counts | Admin |

### 🔬 10. Observability & System Probes
| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `GET` | `/api/v1/health` | Active probe checking PostgreSQL & Redis health and latency | Public |
| `GET` | `/api/v1/db-test` | Direct Knex connection pool diagnostic probe | Public |
| `GET` | `/metrics` | Prometheus metrics scraping endpoint | Public / Scraper |

---

## 3. How to Import Schema into Postman

1. Open Postman.
2. Click **Import** in the top-left corner.
3. Choose **File** and select [`Deliverables/openapi_v2.1.0.json`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/openapi_v2.1.0.json).
4. Select **Import as API Collection**.
5. Set the collection variable `baseUrl` to `http://localhost:3000`.
