import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export class MetricsCollector {
  public registry: Registry;

  // HTTP metrics
  public httpRequestDuration: Histogram<string>;
  public httpRequestTotal: Counter<string>;

  // Tool metrics
  public toolExecutionDuration: Histogram<string>;
  public toolExecutionTotal: Counter<string>;
  public toolExecutionErrors: Counter<string>;

  // Session metrics
  public activeSessions: Gauge<string>;

  // System metrics
  public memoryUsage: Gauge<string>;
  public cpuUsage: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    // Initialize metrics
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.toolExecutionDuration = new Histogram({
      name: 'tool_execution_duration_seconds',
      help: 'Duration of tool executions',
      labelNames: ['tool', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.toolExecutionTotal = new Counter({
      name: 'tool_executions_total',
      help: 'Total number of tool executions',
      labelNames: ['tool', 'status'],
      registers: [this.registry],
    });

    this.toolExecutionErrors = new Counter({
      name: 'tool_execution_errors_total',
      help: 'Total number of tool execution errors',
      labelNames: ['tool', 'error_type'],
      registers: [this.registry],
    });

    this.activeSessions = new Gauge({
      name: 'active_sessions',
      help: 'Number of active sessions',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.memoryUsage = new Gauge({
      name: 'process_memory_bytes',
      help: 'Process memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.cpuUsage = new Gauge({
      name: 'process_cpu_usage_percent',
      help: 'Process CPU usage percentage',
      registers: [this.registry],
    });

    // Collect system metrics every 10 seconds
    this.startSystemMetricsCollection();
  }

  private startSystemMetricsCollection() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
      this.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
      this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
      this.memoryUsage.set({ type: 'external' }, memUsage.external);

      const cpuUsage = process.cpuUsage();
      const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
      this.cpuUsage.set(totalUsage);
    }, 10000);
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

export const metrics = new MetricsCollector();
