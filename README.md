# Multi-Region Property Listing Backend

A distributed property listing backend simulating two geographic regions (US and EU), demonstrating global routing, asynchronous data replication, and data consistency using optimistic locking.

## Architecture Overview

The system runs entirely in Docker and utilizes:
- **Node.js / Express**: Two backend services (US and EU) routing to their own distinct regional Postgres databases.
- **NGINX**: Acts as a reverse proxy, intelligently routing requests (`/us/*` to backend-us, `/eu/*` to backend-eu) and providing automatic fallback/failover to the healthy region.
- **PostgreSQL 14**: Separate databases for US and EU, seeded with synthetic housing data.
- **Apache Kafka**: Used as an asynchronous message queue (`property-updates` topic) to sync state across regions.

## Project Structure

- `docker-compose.yml`: Main deployment entry point with complex healthchecks.
- `backend/`: Source code for the Node.js Express service, shared across both EU and US instances via environment variables.
- `nginx/`: Reverse proxy configuration.
- `seeds/`: PostgreSQL schema and dummy dataset seeding for 1000 properties each.
- `tests/`: Contains integration tests (`test_optimistic_locking.js`) and NGINX test script (`demonstrate_failover.sh`).
- `.env.example`: Template for environment variables.

## Getting Started

### Prerequisites

- Docker and Docker Compose installed.
- Node.js (for running integration tests locally, optional but recommended).

### Running the Application

1. Copy the environment configuration:
```bash
cp .env.example .env
```
*(Optionally tweak the `.env` values, though defaults work out of the box).*

2. Spin up the infrastructure:
```bash
docker-compose up -d
```

3. Wait 1-2 minutes for all services to become healthy (PostgreSQL and Kafka health checks take a bit). NGINX ensures traffic is only sent to healthy backends.

## Core Features & Usage

### 1. Reverse Proxy & Failover
NGINX routes requests on port `8080`.
- Hits to `http://localhost:8080/us/health` are sent to `backend-us`.
- Hits to `http://localhost:8080/eu/health` are sent to `backend-eu`.

If one region goes down, NGINX automatically reroutes traversing traffic to the neighboring healthy region. You can test this via the shell script:
```bash
bash tests/demonstrate_failover.sh
```

### 2. Property Updates & Idempotency
To update a property, use a `PUT` request targeting `/:region/properties/:id`.
**Note:** You must supply an `X-Request-ID` header to prevent duplicate orders.

```bash
curl -X PUT http://localhost:8080/us/properties/1 \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: unique-uuid-1234" \
  -d '{"price": 1250000.50, "version": 1}'
```
Valid responses are `200 OK`. Duplicate `X-Request-ID` requests receive `422 Unprocessable Entity`.

### 3. Cross-Region Replication
When a property is successfully updated in the US database, a message is published to Kafka under the `property-updates` topic. The EU region consumes this message and applies the write to its own database.
Check replication lag via:
```bash
curl http://localhost:8080/eu/replication-lag
```

### 4. Optimistic Locking (Conflict Resolution)
To prevent race conditions, updates must provide the current `version` of the record. Concurrently updating identical versions yields a `409 Conflict` to the slower request. 

To resolve a `409 Conflict`, the API client should explicitly catch the 409 status code, re-fetch the latest data to capture the incremented version, resolve any state disparities, and attempt the `PUT` request again with the new valid version.

Test the locking mechanism via:
```bash
node tests/test_optimistic_locking.js
```

## Logs
NGINX is configured with an extended logging format including upstream response time.
Inspect them via:
```bash
docker logs nginx_proxy
```
