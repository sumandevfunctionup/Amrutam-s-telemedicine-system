# 📈 Deliverable 6: Observability, Telemetry & Distributed Tracing

> **PRD Deliverable #6**: Observability setup  
> **Prometheus Scraper Endpoint**: `GET /metrics`  
> **Health Probe Endpoint**: `GET /api/v1/health`  
> **Database Diagnostics**: `GET /api/v1/db-test`  
> **Tracing Header**: `X-Correlation-ID`

---

## 1. Observability Architecture Overview

The system incorporates deep telemetry across all three pillars of modern observability:
1. **Metrics**: Prometheus instrumentation via `prom-client` tracking latency histograms, request volumes, and system resources.
2. **Tracing**: Distributed request correlation tracing using unique UUIDv4 identifiers attached to every incoming HTTP request.
3. **Health Probes**: Automated dependency health diagnostics providing live connection pings and round-trip latencies for container orchestrators (Kubernetes / Docker).

```mermaid
graph LR
    Client[Incoming Request] --> Corr[Correlation MW]
    Corr --> Prom[Metrics MW]
    Prom --> Morgan[Structured Logger]
    Morgan --> Express[Express Handlers]
    
    subgraph Observability Sinks
        Prom -.-> PrometheusScraper[GET /metrics]
        Morgan -.-> LogStream[stdout with [CorrID: UUID]]
        Express -.-> HealthEndpoint[GET /api/v1/health]
    end
```

---

## 2. Prometheus Metrics Telemetry (`helper/metrics.js`)

Metrics are collected automatically on every HTTP transaction and exported in standard Prometheus text exposition format at `GET /metrics`:

### Exported Metrics Catalog:
- **`amrutam_http_request_duration_seconds`** (Histogram):
  - Tracks API latency across configurable buckets: `[0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]` seconds.
  - Labels: `method`, `route`, `status_code`.
  - Enables calculation of p50, p90, p95, and p99 latency SLOs.
- **`amrutam_http_requests_total`** (Counter):
  - Cumulative count of all HTTP requests processed.
  - Labels: `method`, `route`, `status_code`.
- **`amrutam_process_resident_memory_bytes`** (Gauge):
  - Real-time resident set size (RSS) memory utilization of the Node.js process.
- **`amrutam_process_cpu_user_seconds_total`** (Counter):
  - Total user CPU time spent executing Node.js application code.

### Sample Prometheus Output (`curl http://localhost:3000/metrics`):
```text
# HELP amrutam_http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE amrutam_http_request_duration_seconds histogram
amrutam_http_request_duration_seconds_bucket{le="0.05",method="GET",route="/api/v1/health",status_code="200"} 12
amrutam_http_request_duration_seconds_bucket{le="0.1",method="GET",route="/api/v1/health",status_code="200"} 45
amrutam_http_request_duration_seconds_bucket{le="+Inf",method="GET",route="/api/v1/health",status_code="200"} 48
amrutam_http_request_duration_seconds_sum{method="GET",route="/api/v1/health",status_code="200"} 3.125
amrutam_http_request_duration_seconds_count{method="GET",route="/api/v1/health",status_code="200"} 48

# HELP amrutam_http_requests_total Total number of HTTP requests processed
# TYPE amrutam_http_requests_total counter
amrutam_http_requests_total{method="GET",route="/api/v1/health",status_code="200"} 48
amrutam_http_requests_total{method="POST",route="/api/v1/auth/login",status_code="200"} 15
```

---

## 3. Distributed Request Correlation Tracing (`helper/correlation.js`)

Every HTTP request passing through the system is assigned a unique correlation ID:
- **Ingress Header**: Reads existing `X-Correlation-ID` header if provided by an upstream reverse proxy, or generates a fresh `crypto.randomUUID()`.
- **Context Injection**: Attached to `req.correlationId` for use in controllers and audit logs.
- **Response Header**: Echoed in HTTP response headers as `X-Correlation-ID: <uuid>`.
- **Structured Logging**: Morgan middleware automatically injects the ID into server output:
  ```text
  [2026-09-21T08:02:18.012Z] GET /api/v1/health 200 54.120 ms - [CorrID: 7a82b49c-4f12-4820-9112-9c1234abcd56]
  ```

---

## 4. Live Health & Diagnostics Probes (`controller/healthController.js`)

### 4.1 System & Dependency Health Probe (`GET /api/v1/health`)
Performs live active ping checks against both database and cache dependencies:
- Executes `SELECT 1, NOW(), current_database(), version()` on PostgreSQL pool.
- Executes `redis.ping()` on Upstash Redis cluster and measures exact round-trip latency in milliseconds.
- Returns standard HTTP 200 envelope if healthy; returns 503 if any critical service fails.

#### Sample Health Probe Response:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "System is operating normally",
  "data": {
    "status": "UP",
    "timestamp": "2026-09-21 08:02:18",
    "uptime": 1284,
    "services": {
      "database": {
        "status": "healthy",
        "client": "PostgreSQL",
        "message": "Database connection established successfully.",
        "details": {
          "database": "amrutam_db",
          "serverTime": "2026-09-21 08:02:19",
          "version": "PostgreSQL 18.6 on aarch64-unknown-linux-gnu"
        }
      },
      "redis": {
        "status": "healthy",
        "latency_ms": 54,
        "mode": "upstash-rest"
      }
    }
  },
  "timestamp": "2026-09-21 08:02:18"
}
```

### 4.2 Database Connection Pool Diagnostics (`GET /api/v1/db-test`)
Allows platform administrators to verify database connectivity, current pool settings, and schema information without granting direct shell access to the database server.
