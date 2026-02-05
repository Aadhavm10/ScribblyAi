import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private registry: Registry;

  // HTTP metrics
  public httpRequestsTotal: Counter<string>;
  public httpRequestDuration: Histogram<string>;
  public httpRequestErrors: Counter<string>;

  // WebSocket metrics
  public activeConnections: Gauge<string>;

  // Business metrics
  public notesCreated: Counter<string>;
  public notesUpdated: Counter<string>;
  public notesDeleted: Counter<string>;
  public searchQueries: Counter<string>;

  constructor() {
    this.registry = new Registry();

    // HTTP metrics
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP errors',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    // WebSocket metrics
    this.activeConnections = new Gauge({
      name: 'websocket_connections_active',
      help: 'Number of active WebSocket connections',
      registers: [this.registry],
    });

    // Business metrics
    this.notesCreated = new Counter({
      name: 'notes_created_total',
      help: 'Total number of notes created',
      registers: [this.registry],
    });

    this.notesUpdated = new Counter({
      name: 'notes_updated_total',
      help: 'Total number of notes updated',
      registers: [this.registry],
    });

    this.notesDeleted = new Counter({
      name: 'notes_deleted_total',
      help: 'Total number of notes deleted',
      registers: [this.registry],
    });

    this.searchQueries = new Counter({
      name: 'search_queries_total',
      help: 'Total number of search queries',
      labelNames: ['type'],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    // Collect default Node.js metrics (CPU, memory, event loop, etc.)
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
