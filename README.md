# ScribblyAi

<div align="center">

![ScribblyAi](https://img.shields.io/badge/ScribblyAi-AI%20Memory%20Assistant-6366f1?style=for-the-badge&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs)](https://nestjs.com/)
[![Kafka](https://img.shields.io/badge/Apache%20Kafka-231F20?style=for-the-badge&logo=apachekafka)](https://kafka.apache.org/)
[![Spark](https://img.shields.io/badge/Apache%20Spark-E25A1C?style=for-the-badge&logo=apachespark&logoColor=white)](https://spark.apache.org/)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-005571?style=for-the-badge&logo=elasticsearch)](https://elastic.co/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)
[![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)](https://prometheus.io/)

[Live Demo](https://scribble-ai-ten.vercel.app) · [Report Bug](https://github.com/Aadhavm10/ScribbleAi/issues)

</div>

---

## Tech Stack

### Frontend
| Technology | Version |
|------------|---------|
| Next.js | 15 |
| React | 19 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| NextAuth.js | 4 |
| Socket.io Client | 4 |

### Backend
| Technology | Version |
|------------|---------|
| NestJS | 10 |
| Prisma ORM | 5 |
| PostgreSQL | 16 |
| Elasticsearch | 8 |
| KafkaJS | 2 |
| Google Vertex AI | Gemini 1.5 |

### Event Streaming & Analytics
| Technology | Purpose |
|------------|---------|
| Apache Kafka | Event streaming & message broker |
| Apache Spark | Real-time stream processing |
| Zookeeper | Kafka cluster coordination |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Vercel | Frontend hosting |
| Render | Backend hosting |
| Supabase | Managed PostgreSQL |
| Elastic Cloud | Managed Elasticsearch |
| Google Cloud | Vertex AI, OAuth |
| Docker | Local development |

### Testing & CI/CD
| Technology | Purpose |
|------------|---------|
| Jest | Unit & integration testing |
| React Testing Library | Frontend component tests |
| GitHub Actions | CI/CD pipeline |
| Codecov | Coverage reporting |

### Monitoring
| Technology | Purpose |
|------------|---------|
| Prometheus | Metrics collection |
| Grafana | Visualization & dashboards |
| prom-client | Node.js metrics |

---

## Project Structure

```
ScribblyAi/
├── backend/
│   ├── src/
│   │   ├── notes/              # Notes CRUD
│   │   ├── folders/            # Folder management
│   │   ├── search/             # Hybrid search (BM25 + Vector)
│   │   ├── ai/                 # AI features
│   │   ├── auth/               # Authentication
│   │   ├── connectors/         # Google integrations
│   │   ├── calendar/           # Calendar module
│   │   ├── realtime/           # WebSocket gateway
│   │   ├── kafka/
│   │   │   ├── producers/      # Event producers
│   │   │   ├── consumers/      # Event consumers
│   │   │   └── interfaces/     # Event types
│   │   ├── analytics/          # Real-time metrics
│   │   ├── elasticsearch/      # Search client
│   │   ├── vertex-ai/          # AI client
│   │   ├── metrics/            # Prometheus metrics
│   │   ├── prisma/             # Database ORM
│   │   └── test/               # Test utilities & mocks
│   └── prisma/
│       └── schema.prisma
│
├── frontend/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   ├── notes/
│   │   │   ├── search/
│   │   │   ├── folders/
│   │   │   ├── connectors/
│   │   │   ├── calendar/
│   │   │   └── settings/
│   │   ├── auth/
│   │   └── api/
│   ├── components/
│   ├── contexts/
│   └── lib/
│
├── spark/
│   └── jobs/
│       ├── note_analytics.py   # Note event processing
│       └── sync_analytics.py   # Sync health metrics
│
├── k8s/                        # Kubernetes manifests
│   ├── backend/                # Backend deployment & HPA
│   ├── postgres/               # PostgreSQL StatefulSet
│   ├── kafka/                  # Kafka & Zookeeper
│   └── monitoring/             # Prometheus & Grafana
│
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD pipeline
│
└── docker-compose.yml
```

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│                    Next.js 15 + React 19 (Vercel)                           │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ REST + WebSocket
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                         │
│                         NestJS (Render)                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  Notes  │ │ Folders │ │ Search  │ │   AI    │ │ Connect │ │Realtime │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
│       │           │           │           │           │           │        │
│       └───────────┴───────────┴─────┬─────┴───────────┴───────────┘        │
│                                     │                                       │
│                              ┌──────▼──────┐                                │
│                              │   Kafka     │                                │
│                              │  Producers  │                                │
│                              └──────┬──────┘                                │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌─────────────────┐           ┌─────────────────┐
│  PostgreSQL   │           │     Kafka       │           │  Elasticsearch  │
│  (Supabase)   │           │   (Docker)      │           │ (Elastic Cloud) │
└───────────────┘           └────────┬────────┘           └─────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
             ┌───────────┐    ┌───────────┐    ┌───────────┐
             │ Indexing  │    │  Audit    │    │ Analytics │
             │ Consumer  │    │ Consumer  │    │ Consumer  │
             └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
                   │                │                │
                   │                │                ▼
                   │                │         ┌───────────┐
                   │                │         │   Spark   │
                   │                │         │ Streaming │
                   │                │         └─────┬─────┘
                   │                │               │
                   ▼                ▼               ▼
             Elasticsearch    Audit Trail    Analytics API
```

### Kafka Event Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           KAFKA TOPICS                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  scribbly.notes.events ──────► IndexingConsumer ──────► Elasticsearch   │
│         │                                                                │
│         └────────────────────► AuditLogConsumer ──────► Audit Trail     │
│                                                                          │
│  scribbly.sync.jobs ─────────► SyncWorkerConsumer ────► Google APIs     │
│         │                                                                │
│         └────────────────────► scribbly.sync.results                    │
│                                                                          │
│  scribbly.analytics.events ──► AnalyticsConsumer ─────► Aggregates      │
│                                       │                                  │
│                                       ▼                                  │
│                                 Spark Streaming                          │
│                                       │                                  │
│                                       ▼                                  │
│                          scribbly.analytics.aggregates                   │
│                                                                          │
│  *.dlq ──────────────────────► DlqConsumer ───────────► Error Handling  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Spark Analytics Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Kafka Topics   │     │  Spark Streaming │     │   Output        │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│                 │     │                 │     │                 │
│ notes.events ───┼────►│ note_analytics  │────►│ User Activity   │
│                 │     │    .py          │     │ Metrics         │
│                 │     │                 │     │                 │
│ sync.results ───┼────►│ sync_analytics  │────►│ Sync Health     │
│                 │     │    .py          │     │ Metrics         │
│                 │     │                 │     │                 │
└─────────────────┘     │  5-min windows  │     │ analytics.      │
                        │  Aggregations   │     │ aggregates      │
                        └─────────────────┘     └─────────────────┘
```

### Search Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HYBRID SEARCH                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User Query: "What did we discuss about the roadmap?"                   │
│                           │                                             │
│                           ▼                                             │
│                  ┌─────────────────┐                                    │
│                  │   Vertex AI     │                                    │
│                  │  Embeddings     │                                    │
│                  └────────┬────────┘                                    │
│                           │                                             │
│           ┌───────────────┴───────────────┐                             │
│           │                               │                             │
│           ▼                               ▼                             │
│   ┌───────────────┐               ┌───────────────┐                     │
│   │  BM25 Search  │               │ Vector Search │                     │
│   │  (Keywords)   │               │  (Semantic)   │                     │
│   └───────┬───────┘               └───────┬───────┘                     │
│           │                               │                             │
│           └───────────────┬───────────────┘                             │
│                           │                                             │
│                           ▼                                             │
│                  ┌─────────────────┐                                    │
│                  │ Reciprocal Rank │                                    │
│                  │     Fusion      │                                    │
│                  └────────┬────────┘                                    │
│                           │                                             │
│                           ▼                                             │
│                  ┌─────────────────┐                                    │
│                  │   Gemini LLM    │                                    │
│                  │   Response      │                                    │
│                  └─────────────────┘                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## How to Run

### Prerequisites

- Node.js 20+
- Docker Desktop
- Google Cloud Project (OAuth + Vertex AI)
- Elastic Cloud Account

### 1. Clone & Install

```bash
git clone https://github.com/Aadhavm10/ScribbleAi.git
cd ScribbleAi

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Environment Setup

**backend/.env**
```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GCP_PROJECT_ID="..."
VERTEX_AI_LOCATION="us-central1"
ELASTICSEARCH_URL="https://..."
ELASTICSEARCH_API_KEY="..."
TOKEN_ENCRYPTION_KEY="..."
KAFKA_BROKERS="localhost:9092"
KAFKA_ENABLED="true"
```

**frontend/.env.local**
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_API_URL=http://localhost:3002
```

### 3. Start Infrastructure

```bash
# Start Kafka, Spark, Zookeeper, PostgreSQL
docker compose up -d
```

### 4. Database Migration

```bash
cd backend
npx prisma generate
npx prisma db push
```

### 5. Run Application

```bash
# Terminal 1 - Backend
cd backend && npm run start:dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### 6. Access Services

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:3002 |
| Kafka UI | http://localhost:8081 |
| Spark UI | http://localhost:8080 |
| PgAdmin | http://localhost:5050 |

---

## Testing

### Run Tests

```bash
# Backend tests
cd backend && npm run test

# Backend with coverage
cd backend && npm run test:cov

# Frontend tests
cd frontend && npm run test

# E2E tests
cd backend && npm run test:e2e
```

### Test Structure

```
backend/src/
├── notes/
│   └── notes.service.spec.ts      # Notes CRUD tests
├── auth/
│   └── auth.service.spec.ts       # Auth & JWT tests
├── folders/
│   └── folders.service.spec.ts    # Folder operations tests
├── app.controller.spec.ts         # Health endpoint tests
└── test/
    ├── mock-factory.ts            # Centralized mocks
    └── fixtures.ts                # Test data

frontend/
├── lib/__tests__/
│   └── api.test.ts                # API layer tests
├── jest.config.js
└── jest.setup.ts
```

### CI/CD Pipeline

GitHub Actions runs on every push:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CI PIPELINE                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │  Backend    │   │  Frontend   │   │    Lint     │           │
│  │   Tests     │   │   Tests     │   │             │           │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘           │
│         │                 │                 │                   │
│         └────────────┬────┴─────────────────┘                   │
│                      │                                          │
│                      ▼                                          │
│              ┌─────────────┐                                    │
│              │    Build    │                                    │
│              │ Verification│                                    │
│              └─────────────┘                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Kubernetes Deployment

### Prerequisites

- Minikube or Docker Desktop with Kubernetes
- kubectl configured

### Deploy to Local Cluster

```bash
# Start Minikube
minikube start --memory=4096 --cpus=2
minikube addons enable ingress
minikube addons enable metrics-server

# Deploy all services
./k8s/deploy.sh

# Check status
kubectl get pods -n scribbly
kubectl get hpa -n scribbly
```

### K8s Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    KUBERNETES CLUSTER                            │
│                     namespace: scribbly                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      INGRESS                             │   │
│  │            api.scribbly.local → backend-service          │   │
│  └────────────────────────────┬────────────────────────────┘   │
│                               │                                 │
│                               ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              BACKEND DEPLOYMENT (2-5 replicas)           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │  Pod 1  │  │  Pod 2  │  │  Pod 3  │  │  ...    │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  │                    HPA: Scale on CPU > 70%               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│         ┌─────────────────────┼─────────────────────┐          │
│         │                     │                     │          │
│         ▼                     ▼                     ▼          │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐    │
│  │  PostgreSQL │      │    Kafka    │      │  Prometheus │    │
│  │ StatefulSet │      │ Deployment  │      │  + Grafana  │    │
│  └─────────────┘      └─────────────┘      └─────────────┘    │
│                               │                                 │
│                               ▼                                 │
│                        ┌─────────────┐                         │
│                        │  Zookeeper  │                         │
│                        └─────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### K8s Services

| Service | Type | Port |
|---------|------|------|
| backend-service | ClusterIP | 3002 |
| postgres-service | ClusterIP | 5432 |
| kafka-service | ClusterIP | 9092 |
| prometheus-service | NodePort | 9090 |
| grafana-service | NodePort | 3000 |

---

## Monitoring

### Backend Metrics

The backend exposes Prometheus metrics at `/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by method/path/status |
| `http_request_duration_seconds` | Histogram | Request latency (P50, P95, P99) |
| `http_request_errors_total` | Counter | Total error responses |
| `notes_created_total` | Counter | Business metric: notes created |
| `search_queries_total` | Counter | Business metric: search queries |
| `websocket_connections_active` | Gauge | Active WebSocket connections |

### Access Dashboards

```bash
# Prometheus UI
minikube service prometheus-service -n scribbly

# Grafana (admin/admin)
minikube service grafana-service -n scribbly

# Or with kubectl port-forward
kubectl port-forward svc/grafana-service 3001:3000 -n scribbly
```

### Grafana Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                SCRIBBLYAI BACKEND METRICS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  QPS: 150    │  │ Error: 0.1%  │  │ P99: 120ms   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                Request Latency Distribution               │  │
│  │  ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░  │  │
│  │  P50: 25ms    P95: 80ms    P99: 120ms                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 Requests by Status Code                   │  │
│  │  200 ████████████████████████████████████ 95%            │  │
│  │  201 ██████ 3%                                           │  │
│  │  500 █ 0.1%                                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │ Notes(24h) │  │ Search/min │  │ WebSockets │               │
│  │    1,234   │  │     45     │  │     12     │               │
│  └────────────┘  └────────────┘  └────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Keep-Alive Setup (Free Tier)

Render and Supabase free tiers spin down after inactivity. To keep services warm:

1. The backend has a `/health` endpoint that pings the database
2. Set up a free cron job at [cron-job.org](https://cron-job.org):
   - **URL:** `https://your-render-url.onrender.com/health`
   - **Schedule:** Every 5 minutes

This keeps both Render (prevents cold starts) and Supabase (prevents database pausing) active.

---

<div align="center">

**MIT License**

</div>
