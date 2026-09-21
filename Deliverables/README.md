# 📁 Amrutam Telemedicine System — Master Deliverables Index

> **Assignment Source**: `PRD/Backend Developer Assignment new.pdf`  
> **System Version**: `v2.1.0`  
> **Target Scale**: 100,000 daily consultations | 99.95% availability | p95 read latency < 200ms  
> **Universal Standard**: All timestamps across all APIs are strictly in **UTC** formatted as `yyyy-mm-dd hh:mm:ss`.

---

## 🎯 PRD Deliverables Compliance Matrix

This directory centralizes all **7 mandatory deliverables** specified in the assignment PRD. Every deliverable is mapped below to its dedicated document and source code location:

| # | PRD Deliverable | Dedicated Document | Key Source Code / Configurations | Verification Command |
|---|---|---|---|---|
| **1** | **Git repo with code and infra** | [01_CODE_AND_INFRASTRUCTURE.md](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/01_CODE_AND_INFRASTRUCTURE.md) | `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `index.js` | `docker compose up --build` |
| **2** | **README with setup** | [02_README_AND_SETUP.md](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/02_README_AND_SETUP.md) | `README.md`, `.env.example` | `cp .env.example .env && npm start` |
| **3** | **OpenAPI / Swagger schema** | [03_OPENAPI_SPECIFICATION.md](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/03_OPENAPI_SPECIFICATION.md) | `helper/swagger.js`, `Deliverables/openapi_v2.1.0.json` | `curl http://localhost:3000/api-docs.json` |
| **4** | **Architecture doc (2–4 pages)** | [04_ARCHITECTURE_DOCUMENT.md](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/04_ARCHITECTURE_DOCUMENT.md) | `ARCHITECTURE.md`, `BLUEPRINT.md` | Inspect architectural document |
| **5** | **Tests and CI pipeline** | [05_TESTS_AND_CI_PIPELINE.md](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/05_TESTS_AND_CI_PIPELINE.md) | `test/run_all_tests.js`, `test/*.js`, `.github/workflows/ci.yml` | `npm test` |
| **6** | **Observability setup** | [06_OBSERVABILITY_SETUP.md](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/06_OBSERVABILITY_SETUP.md) | `helper/metrics.js`, `helper/correlation.js`, `controller/healthController.js` | `curl http://localhost:3000/metrics` |
| **7** | **Security checklist & threat model** | [07_SECURITY_CHECKLIST_AND_THREAT_MODEL.md](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/07_SECURITY_CHECKLIST_AND_THREAT_MODEL.md) | `auth/middleware.js`, `auth/rateLimiter.js`, `ARCHITECTURE.md` | Inspect security audit matrix |

---

## 📚 Supporting Operational Guides

In addition to the 7 core deliverables, this folder provides supplementary operational guides:

- 📖 **[Modules & Complete API Evaluation Guide](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/MODULES_AND_APIS_GUIDE.md)**: Deep dive into all 10 modules, endpoints, request/response bodies, business logic, and security rules.
- 🐳 **[Docker Deployment & Operations Guide](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/DOCKER_GUIDE.md)**: Step-by-step walkthrough to build, configure `.env`, and launch using Docker and Docker Compose.
- ⚡ **[Redis Architecture & Operational Guide](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/REDIS_DOCUMENTATION.md)**: Upstash HTTPS REST caching, distributed locking, and token revocation.
- 🎥 **[5-Minute Video Presentation Script](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/DEMO_SCRIPT.md)**: Minute-by-minute presenter walkthrough.
- 📦 **[Raw OpenAPI 3.0 Contract (JSON)](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/Deliverables/openapi_v2.1.0.json)**: Standalone JSON file ready for direct Postman or Swagger Editor import.

---

## ⚡ 60-Second Evaluator Quickstart

```bash
# 1. Clone repository
git clone https://github.com/sumandevfunctionup/Amrutam-s-telemedicine-system.git
cd Amrutam-s-telemedicine-system

# 2. Setup environment (Pre-configured with working Neon DB & Upstash Redis)
cp .env.example .env

# 3. Launch via Docker Compose (Builds Alpine container & runs auto-migrations)
docker compose up --build

# 4. In another terminal, run all 11 architectural suites (100% pass rate)
npm test
```
