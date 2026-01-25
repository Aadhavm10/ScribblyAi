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
| Railway | Backend hosting |
| Supabase | Managed PostgreSQL |
| Elastic Cloud | Managed Elasticsearch |
| Google Cloud | Vertex AI, OAuth |
| Docker | Local development |

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
│   │   └── prisma/             # Database ORM
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
│                         NestJS (Railway)                                     │
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

<div align="center">

**MIT License**

</div>
