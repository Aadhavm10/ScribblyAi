# ScribblyAi

<div align="center">

![ScribblyAi](https://img.shields.io/badge/ScribblyAi-AI%20Memory%20Assistant-6366f1?style=for-the-badge&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs)](https://nestjs.com/)
[![Kafka](https://img.shields.io/badge/Apache%20Kafka-231F20?style=for-the-badge&logo=apachekafka)](https://kafka.apache.org/)
[![Spark](https://img.shields.io/badge/Apache%20Spark-E25A1C?style=for-the-badge&logo=apachespark&logoColor=white)](https://spark.apache.org/)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-005571?style=for-the-badge&logo=elasticsearch)](https://elastic.co/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)
[![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)](https://prometheus.io/)


</div>

**An AI memory assistant for your notes.** Write and organize notes in folders, connect your Google account (Gmail, Drive, Docs, and Calendar), and ask questions in plain English. Gemini answers from your own notes, and built-in AI tools summarize notes, rephrase text (formal, casual, or concise), and extract tasks.

<!--
  Screenshots: save images to docs/screenshots/ and delete this comment's opening and closing lines.

<p align="center">
  <img src="docs/screenshots/ask-your-notes.png" alt="Asking a question and getting an answer from your own notes" width="49%">
  <img src="docs/screenshots/live-collaboration.png" alt="Two users editing the same note with live cursors" width="49%">
</p>
-->

## Features

- **Ask your notes:** type a question and get an answer grounded in your own notes, Gmail, and Drive.
- **Hybrid search:** finds both exact keywords and notes with similar meaning.
- **AI writing tools:** summaries, rephrasing in three tones, and task extraction.
- **Real-time collaboration:** live cursors, presence, and typing indicators when people edit the same note.
- **Google integrations:** Gmail, Drive, Docs, and Calendar, with a built-in calendar view.
- **Folders and organization** for keeping notes structured.

## Highlights

- **Event-driven backend:** NestJS services publish to Kafka (10 topics, 5 consumer groups), and dedicated consumers handle search indexing, audit logging, Google sync, and analytics.
- **Dead-letter handling:** failed messages land in one of 3 dead-letter topics, are retried up to 5 times with exponential backoff, and are then saved to PostgreSQL as failed jobs instead of being dropped.
- **Hybrid search:** Elasticsearch BM25 keyword search and kNN vector search over Vertex AI embeddings (`text-embedding-004`), fused with reciprocal rank fusion across notes, Gmail, and Drive. Search degrades to keyword-only without embeddings and to PostgreSQL without Elasticsearch.
- **Two language models, each for its own job:** Gemini 1.5 Pro answers questions from retrieved notes; Groq Llama 3 70B handles summaries, rephrasing, and task extraction.
- **Real-time collaboration:** a Socket.IO gateway broadcasts cursor positions, presence, and typing indicators to everyone in a note, with edits recorded in an audit trail.
- **Security:** Google OAuth sign-in, JWT sessions with Passport guards, and Google access tokens encrypted at rest with AES-256-GCM and refreshed automatically.
- **Streaming analytics:** Spark Structured Streaming jobs aggregate note activity (1- and 5-minute windows) and Google sync health (10- and 30-minute windows), publishing results back to Kafka.
- **Observability:** Prometheus metrics for request rate, errors, latency histograms, and business counters, with a provisioned Grafana dashboard.
- **CI:** GitHub Actions runs backend and frontend tests with Codecov coverage, lint, and production builds on every push and pull request.
- **Kubernetes:** manifests for the full stack, with a Horizontal Pod Autoscaler scaling the backend from 2 to 5 replicas.

## Design Decisions

- **Why Kafka?** Indexing a note means calling an embedding model, and Google sync calls external APIs. Both are slow and can fail. Publishing events lets a save return immediately while consumers do that work in the background, and a failure in one consumer doesn't block the others.
- **Why hybrid search?** Keyword search misses notes that say the same thing in different words; vector search can miss exact names and terms. Fusing both with reciprocal rank fusion covers each one's blind spot without tuning score weights.
- **Why graceful fallbacks?** If embeddings or Elasticsearch are unavailable, search falls back to keyword-only or PostgreSQL instead of failing, so the core app keeps working.
- **Honest scope note:** I built ScribblyAi to learn event-driven architecture, stream processing, and deployment. At its current scale, a single service with a job queue would be enough; Kafka, Spark, and Kubernetes are here so I could build and understand each layer end to end.

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
| NestJS | 11 |
| Prisma ORM | 6 |
| PostgreSQL | 16 |
| Elasticsearch | 8 |
| KafkaJS | 2 |

### AI Models
| Model | Used for |
|-------|----------|
| Gemini 1.5 Pro (Vertex AI) | Answering questions from your notes |
| text-embedding-004 (Vertex AI) | Note embeddings for semantic indexing |
| Llama 3 70B (Groq) | Summaries, rephrasing, and task extraction |

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
│   │   ├── search/             # Hybrid search, indexing & Q&A
│   │   ├── ai/                 # Summaries, rephrasing, tasks (Groq)
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
│   │   ├── vertex-ai/          # Gemini + embeddings client
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
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                      KAFKA TOPICS                                     │
├───────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  scribbly.notes.events ──────► IndexingConsumer ─────► Elasticsearch                  │
│                                                                                       │
│  scribbly.audit.log ─────────► AuditLogConsumer ─────► Audit Trail                    │
│                                                                                       │
│  scribbly.sync.jobs ─────────► SyncWorkerConsumer ───► Google APIs                    │
│                                        │                                              │
│                                        └─────────────► scribbly.sync.results          │
│                                                                                       │
│  scribbly.analytics.events ──► AnalyticsConsumer ────► AnalyticsMetric (PostgreSQL)   │
│                                                                                       │
│  scribbly.notes.events ─┐                                                             │
│                         ├────► Spark Streaming ──────► scribbly.analytics.aggregates  │
│  scribbly.sync.results ─┘                                        │                    │
│                                                                  ▼                    │
│                                                           Analytics API               │
│                                                                                       │
│  *.dlq ──────────────────────► DlqConsumer ──────────► Retry / FailedJob              │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
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
└─────────────────┘     │ 1–30 min windows│     │ analytics.      │
                        │  Aggregations   │     │ aggregates      │
                        └─────────────────┘     └─────────────────┘
```

### Search Architecture

**Write path (indexing):**

```
Note saved ──► scribbly.notes.events ──► IndexingConsumer
                                              │
                                              ▼
                               Vertex AI text-embedding-004
                                              │
                                              ▼
                          Elasticsearch (dense_vector, cosine)

        on failure (after retries with backoff) ──► scribbly.indexing.commands.dlq ──► DlqConsumer
```

**Read path (hybrid search and Q&A):**

```
                         Query
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
   ┌───────────────┐              ┌─────────────────┐
   │  BM25 Search  │              │ Vertex AI query │
   │  (keywords,   │              │    embedding    │
   │ fuzzy match)  │              └────────┬────────┘
   └───────┬───────┘                       ▼
           │                      ┌─────────────────┐
           │                      │   kNN Search    │
           │                      │ (cosine, top 50)│
           │                      └────────┬────────┘
           └───────────────┬───────────────┘
                           ▼
                  ┌─────────────────┐
                  │ Reciprocal Rank │
                  │ Fusion (k = 60) │
                  └────────┬────────┘
                           │
                           ├──► /search/hybrid results
                           │
                           ▼
              Gemini 1.5 Pro answers from the top 5
```

Both searches are filtered to the user's own documents and the selected providers (notes, Gmail, Drive). If the query can't be embedded, search runs BM25 only; if Elasticsearch is unavailable, it falls back to a PostgreSQL text match. After changing the embedding model, `POST /search/reindex` re-embeds the current user's notes.

---

## How to Run

### Prerequisites

- Node.js 20+
- Docker Desktop
- Google Cloud Project (OAuth + Vertex AI)
- Elastic Cloud Account

### 1. Clone & Install

```bash
git clone https://github.com/Aadhavm10/ScribblyAi.git
cd ScribblyAi

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Environment Setup

Copy `frontend/env.example` to `frontend/.env.local` and `backend/gcp-service-account.json.example` to `backend/gcp-service-account.json`, then fill in the values below.

**backend/.env**
```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GCP_PROJECT_ID="..."
VERTEX_AI_LOCATION="us-central1"
GOOGLE_APPLICATION_CREDENTIALS="./gcp-service-account.json"
EMBEDDING_MODEL="text-embedding-004"
ELASTICSEARCH_URL="https://..."
ELASTICSEARCH_API_KEY="..."
TOKEN_ENCRYPTION_KEY="..."
JWT_SECRET="..."
GROQ_API_KEY="..."
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

The backend exposes Prometheus metrics at `/metrics` (via `prom-client` and a request interceptor). Prometheus and Grafana run in the Kubernetes deployment, from `k8s/monitoring/`.

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by method/path/status |
| `http_request_duration_seconds` | Histogram | Request latency (P50, P95, P99) |
| `http_request_errors_total` | Counter | Total error responses |
| `notes_created_total` | Counter | Business metric: notes created |
| `notes_updated_total` | Counter | Business metric: notes updated |
| `notes_deleted_total` | Counter | Business metric: notes deleted |
| `search_queries_total` | Counter | Search queries by mode (`hybrid`, `keyword`, `database`) |
| `websocket_connections_active` | Gauge | Active WebSocket connections |

### Access Dashboards

```bash
# Prometheus UI
minikube service prometheus-service -n scribbly

# Grafana (change the default login in k8s/monitoring/ before exposing it)
minikube service grafana-service -n scribbly

# Or with kubectl port-forward
kubectl port-forward svc/grafana-service 3001:3000 -n scribbly
```

### Grafana Dashboard

Provisioned from `k8s/monitoring/grafana-dashboard.yaml`:

| Panel | PromQL |
|-------|--------|
| Request Rate (QPS) | `sum(rate(http_requests_total[5m]))` |
| Error Rate (%) | `sum(rate(http_request_errors_total[5m])) / sum(rate(http_requests_total[5m])) * 100` |
| P99 Latency | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |
| Latency Distribution | P50, P95, and P99 from the same histogram |
| Requests by Status Code | `sum(rate(http_requests_total[5m])) by (status)` |
| Notes Created (24h) | `sum(increase(notes_created_total[24h]))` |
| Search Queries/min | `sum(rate(search_queries_total[5m])) * 60` |
| WebSocket Connections | `websocket_connections_active` |

---

## Hosting Note

The hosted backend runs on Render and Supabase free tiers, which pause after inactivity. A scheduled ping to the backend's `/health` endpoint keeps both awake.

---

## License

MIT. See [LICENSE](LICENSE).
