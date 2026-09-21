# 🐳 Amrutam Telemedicine Backend — Docker Deployment Guide

> **Target Audience**: Evaluators, DevOps Engineers & Backend Developers  
> **Purpose**: A comprehensive, step-by-step walkthrough for building, deploying, and running the Amrutam Telemedicine System using Docker and Docker Compose.  
> **Target Environment**: Production-ready, multi-stage Alpine container (`node:22-alpine`) with automated migrations, health checks, and unprivileged user security.

---

## 📑 Table of Contents

1. [Prerequisites](#-prerequisites)
2. [Quickstart (Zero-Config in 60 Seconds)](#-quickstart-zero-config-in-60-seconds)
3. [Environment Configuration (`.env.example`)](#-environment-configuration-envexample)
4. [Deployment Methods](#-deployment-methods)
   - [Method 1: Docker Compose (Cloud DB + Redis)](#method-1-docker-compose-with-cloud-services-recommended)
   - [Method 2: Docker Compose (Isolated Local PostgreSQL)](#method-2-docker-compose-with-isolated-local-postgresql)
   - [Method 3: Standalone Docker Build & Run](#method-3-standalone-docker-build--run)
5. [Post-Startup Verification & Endpoints](#-post-startup-verification--endpoints)
6. [Executing Tests & Seeds Inside Docker](#-executing-tests--seeds-inside-docker)
7. [Operational & Troubleshooting Commands](#-operational--troubleshooting-commands)
8. [Container Security & Architecture Details](#-container-security--architecture-details)

---

## 📋 Prerequisites

Before running the application, ensure your host system has:
- **Docker Engine**: version 24.0+ (`docker --version`)
- **Docker Compose**: version 2.20+ (`docker compose version`)
- **Git**: (`git --version`)

---

## ⚡ Quickstart (Zero-Config in 60 Seconds)

If you have just cloned the repository, execute these two commands to get the entire system running:

```bash
# 1. Create .env from the pre-configured example file
cp .env.example .env

# 2. Build and launch the container stack
docker compose up --build
```

That's it! The system will automatically:
1. Build a multi-stage production Alpine image.
2. Connect to the pre-configured serverless database (Neon PostgreSQL).
3. Connect to the pre-configured distributed Redis cache (Upstash).
4. Run pending database migrations automatically via `docker-entrypoint.sh`.
5. Expose the API and interactive Swagger documentation on **port 3000**.

---

## ⚙️ Environment Configuration (`.env.example`)

The repository includes a documented [`.env.example`](file:///home/suman/Desktop/workplace/amrutum/Amrutam-s-telemedicine-system/.env.example) template:

```env
# Application Server
PORT=3000
NODE_ENV=development

# 1. Database Configuration (PostgreSQL)
# Pre-configured with active migrations and test dataset:
DB_CONNECTION_STRING=postgresql://amrutam_db_owner:npg_w6FEzAOpeb9a@ep-mute-recipe-azm0zk1i-pooler.c-3.ap-southeast-1.aws.neon.tech/amrutam_db?sslmode=require&channel_binding=require

# 2. JWT & Authentication Security
JWT_SECRET=amrutam_telemedicine_jwt_super_secret_key_2026
JWT_REFRESH_SECRET=amrutam_telemedicine_jwt_refresh_super_secret_key_2026
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
MFA_APP_NAME="Amrutam Telemedicine"

# 3. Distributed Cache & Mutex (Upstash Redis HTTPS REST)
UPSTASH_REDIS_REST_URL="https://stirring-lacewing-285784.upstash.io"
UPSTASH_REDIS_REST_TOKEN="gQAAAAAABFxYAAIgcDI0ZGJmYzNlZWI3Yjg0OTYyOTYzYTE3ZmY5MjNmY2QwMA"
```

### Configuration Options:
- **Use Default Cloud Services**: Keep the credentials in `.env.example` as-is. They point to a live Neon PostgreSQL pooler and Upstash Redis cluster.
- **Use Your Own Cloud Credentials**: Replace `DB_CONNECTION_STRING`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` with your own credentials.
- **Use Local PostgreSQL in Docker**: Comment out `DB_CONNECTION_STRING` or leave it blank. Docker Compose will automatically connect to its bundled `postgres:16-alpine` container.

---

## 🚀 Deployment Methods

### Method 1: Docker Compose with Cloud Services (Recommended)
This runs the lightweight API container connected to cloud database and cache:

```bash
# Start in foreground with live logs
docker compose up --build

# Or start in detached mode (background)
docker compose up -d --build
```

---

### Method 2: Docker Compose with Isolated Local PostgreSQL
If you want to run completely offline without cloud database connectivity:

1. In your `.env` file, comment out or empty `DB_CONNECTION_STRING`:
   ```env
   # DB_CONNECTION_STRING=
   ```
2. Start Docker Compose:
   ```bash
   docker compose up --build
   ```
3. Docker Compose will start both the `amrutam_postgres` container and the `amrutam_telemedicine_api` container, automatically wiring the network and running migrations.
4. (Optional) Populate the local database with realistic seed data:
   ```bash
   docker compose exec api npm run seed
   ```

---

### Method 3: Standalone Docker Build & Run
If you prefer building and running the Docker image directly without Docker Compose:

```bash
# 1. Build the production Docker image
docker build -t amrutam-telemedicine-api .

# 2. Run the container passing your .env file
docker run -d \
  --name amrutam_api \
  -p 3000:3000 \
  --env-file .env \
  amrutam-telemedicine-api

# 3. Inspect container logs
docker logs -f amrutam_api
```

---

## 🔎 Post-Startup Verification & Endpoints

Once the container is running, verify system operation using your browser or terminal:

| Resource | URL | Expected Response / Purpose |
|---|---|---|
| **System Health Check** | `http://localhost:3000/api/v1/health` | Returns `status: "UP"`, PostgreSQL `healthy`, and Redis `healthy`. |
| **Interactive API Docs** | `http://localhost:3000/api-docs` | Full interactive Swagger UI with the **`v2.1.0`** green badge. |
| **OpenAPI 3.0 JSON** | `http://localhost:3000/api-docs.json` | Raw OpenAPI contract for Postman or client generator import. |
| **Prometheus Metrics** | `http://localhost:3000/metrics` | Prometheus telemetry (HTTP histograms, resident memory, CPU). |
| **Database Probe** | `http://localhost:3000/api/v1/db-test` | Direct verification of Knex connection pool. |

### Quick CLI Verification:
```bash
curl -s http://localhost:3000/api/v1/health | jq
```

Sample output:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "System is operating normally",
  "data": {
    "status": "UP",
    "timestamp": "2026-09-21 08:00:00",
    "services": {
      "database": {
        "status": "healthy",
        "client": "PostgreSQL",
        "message": "Database connection established successfully."
      },
      "redis": {
        "status": "healthy",
        "latency_ms": 65,
        "mode": "upstash-rest"
      }
    }
  }
}
```

---

## 🧪 Executing Tests & Seeds Inside Docker

You can run commands directly inside the running container using `docker compose exec`:

### Run the Master Architectural Test Suite (11 Suites):
```bash
docker compose exec api npm test
```
*(Executes all 11 test suites covering Auth/MFA, Locking Mutex, SOAP notes, Prescriptions, Saga Rollbacks, Search, Compliance, Analytics, Observability, and Rate Limiting with 100% pass rate).*

### Apply Fresh Database Migrations:
```bash
docker compose exec api npm run migrate
```

### Roll Back Last Migration:
```bash
docker compose exec api npm run migrate:rollback
```

### Populate Seed Dataset (Doctors, Patients, Appointments, Slots):
```bash
docker compose exec api npm run seed
```

---

## 🛠️ Operational & Troubleshooting Commands

### View Live Container Logs:
```bash
# Follow logs for all services
docker compose logs -f

# Follow logs specifically for the API service
docker compose logs -f api
```

### Stop the Containers:
```bash
# Stop containers gracefully
docker compose down

# Stop and remove named volumes (cleans local postgres database)
docker compose down -v
```

### Restart Containers:
```bash
docker compose restart api
```

### Open an Interactive Shell Inside the Container:
```bash
docker compose exec api /bin/sh
```

---

## ⚠️ Common Troubleshooting Scenarios

### 1. Port 3000 is already in use
If another application on your host is using port 3000:
- Open `docker-compose.yml` and change the port mapping:
  ```yaml
  ports:
    - "3001:3000"
  ```
- Then access the API at `http://localhost:3001/api-docs`.

### 2. Container Healthcheck Status
Check container status and health report:
```bash
docker ps
```
The status should report `Up (healthy)`. If it reports `unhealthy`:
- Run `docker compose logs api` to inspect startup errors.
- Confirm your database connection string and internet access (for Upstash Redis).

---

## 🛡️ Container Security & Architecture Details

The Docker environment is built to enterprise production specifications:

1. **Multi-Stage Build (`Dockerfile`)**:
   - Stage 1 (`builder`): Installs dependencies with `npm ci --omit=dev` and native build tools (`make`, `g++`, `python3`).
   - Stage 2 (`runner`): Copies only production code and artifacts into a minimal Alpine Linux image (`node:22-alpine`), reducing surface vulnerability and attack vectors.
2. **Least-Privilege Execution**:
   - The application does not run as root. The container executes under the built-in non-root `USER node` (UID 1000).
3. **Automated Entrypoint Pipeline (`docker-entrypoint.sh`)**:
   - Executes database migration checks before launching the Express process (`npm run migrate`).
   - Uses POSIX shell `exec "$@"` to ensure Node.js receives `SIGTERM` and `SIGINT` signals for graceful container shutdown.
4. **Native Docker Healthcheck**:
   - Configured with `curl -f http://localhost:3000/api/v1/health` running every 30 seconds with a 15-second grace period.
