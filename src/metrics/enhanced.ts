import { Registry, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { connectionPool } from '../utils/connection-pool.js';
import {
  commandCircuitBreaker,
  transportCircuitBreaker,
  sessionCircuitBreaker,
} from '../utils/retry.js';
import { logger } from '../utils/logger.js';

export class EnhancedMetricsCollector {
  public registry: Registry;

  // HTTP metrics
  public httpRequestDuration: Histogram<string>;
  public httpRequestTotal: Counter<string>;
  public httpRequestErrors: Counter<string>;

  // Tool metrics
  public toolExecutionDuration!: Histogram<string>;
  public toolExecutionTotal!: Counter<string>;
  public toolExecutionErrors!: Counter<string>;

  // Session metrics
  public activeSessions: Gauge<string>;
  public sessionDuration: Histogram<string>;
  public sessionCreationRate: Counter<string>;
  public sessionErrorRate: Counter<string>;

  // Connection Pool metrics
  public connectionPoolSize: Gauge<string>;
  public connectionPoolMaxSize: Gauge<string>;
  public connectionPoolCreationTotal: Counter<string>;
  public connectionPoolCleanupTotal: Counter<string>;
  public connectionPoolStaleCleanups: Counter<string>;

  // Retry & Circuit Breaker metrics
  public retryAttemptsTotal: Counter<string>;
  public retrySuccessTotal: Counter<string>;
  public retryFailureTotal: Counter<string>;
  public circuitBreakerState: Gauge<string>;
  public circuitBreakerTransitions: Counter<string>;
  public circuitBreakerFailures: Gauge<string>;

  // Error metrics
  public errorTotal: Counter<string>;
  public errorByType: Counter<string>;
  public errorByEndpoint: Counter<string>;

  // Command execution metrics
  public commandExecutionTime: Histogram<string>;
  public commandExecutionTotal: Counter<string>;
  public commandExecutionErrors: Counter<string>;
  public commandAllowed: Counter<string>;
  public commandDenied: Counter<string>;

  // Transport metrics
  public transportMessagesSent: Counter<string>;
  public transportMessagesReceived: Counter<string>;
  public transportErrors: Counter<string>;
  public transportLatency: Summary<string>;

  // System metrics
  public memoryUsage: Gauge<string>;
  public cpuUsage: Gauge<string>;
  public eventLoopLag: Gauge<string>;
  public activeHandles: Gauge<string>;
  public activeRequests: Gauge<string>;
  public heapSize: Gauge<string>;
  public heapUsed: Gauge<string>;

  // Performance metrics
  public requestQueueSize: Gauge<string>;
  public responseTimePercentile: Summary<string>;
  public throughput: Counter<string>;

  constructor() {
    this.registry = new Registry();

    // HTTP metrics
    this.httpRequestDuration = new Histogram({
      name: 'mcp_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code', 'endpoint'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestTotal = new Counter({
      name: 'mcp_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'endpoint'],
      registers: [this.registry],
    });

    this.httpRequestErrors = new Counter({
      name: 'mcp_http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_type', 'endpoint'],
      registers: [this.registry],
    });

    // Session metrics
    this.activeSessions = new Gauge({
      name: 'mcp_active_sessions',
      help: 'Number of active sessions',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.sessionDuration = new Histogram({
      name: 'mcp_session_duration_seconds',
      help: 'Duration of sessions in seconds',
      labelNames: ['type'],
      buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
      registers: [this.registry],
    });

    this.sessionCreationRate = new Counter({
      name: 'mcp_sessions_created_total',
      help: 'Total number of sessions created',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.sessionErrorRate = new Counter({
      name: 'mcp_session_errors_total',
      help: 'Total number of session errors',
      labelNames: ['type', 'error_type'],
      registers: [this.registry],
    });

    // Connection Pool metrics
    this.connectionPoolSize = new Gauge({
      name: 'mcp_connection_pool_size',
      help: 'Current size of connection pool',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.connectionPoolMaxSize = new Gauge({
      name: 'mcp_connection_pool_max_size',
      help: 'Maximum size reached in connection pool',
      registers: [this.registry],
    });

    this.connectionPoolCreationTotal = new Counter({
      name: 'mcp_connection_pool_creations_total',
      help: 'Total number of connections created in pool',
      registers: [this.registry],
    });

    this.connectionPoolCleanupTotal = new Counter({
      name: 'mcp_connection_pool_cleanups_total',
      help: 'Total number of connections cleaned up',
      registers: [this.registry],
    });

    this.connectionPoolStaleCleanups = new Counter({
      name: 'mcp_connection_pool_stale_cleanups_total',
      help: 'Total number of stale connections cleaned up',
      registers: [this.registry],
    });

    // Retry & Circuit Breaker metrics
    this.retryAttemptsTotal = new Counter({
      name: 'mcp_retry_attempts_total',
      help: 'Total number of retry attempts',
      labelNames: ['operation', 'result'],
      registers: [this.registry],
    });

    this.retrySuccessTotal = new Counter({
      name: 'mcp_retry_successes_total',
      help: 'Total number of successful retries',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    this.retryFailureTotal = new Counter({
      name: 'mcp_retry_failures_total',
      help: 'Total number of retry failures',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    this.circuitBreakerState = new Gauge({
      name: 'mcp_circuit_breaker_state',
      help: 'Current state of circuit breaker (0=closed, 1=half-open, 2=open)',
      labelNames: ['breaker_name'],
      registers: [this.registry],
    });

    this.circuitBreakerTransitions = new Counter({
      name: 'mcp_circuit_breaker_transitions_total',
      help: 'Total number of circuit breaker state transitions',
      labelNames: ['breaker_name', 'from_state', 'to_state'],
      registers: [this.registry],
    });

    this.circuitBreakerFailures = new Gauge({
      name: 'mcp_circuit_breaker_failures',
      help: 'Current failure count in circuit breaker',
      labelNames: ['breaker_name'],
      registers: [this.registry],
    });

    // Error metrics
    this.errorTotal = new Counter({
      name: 'mcp_errors_total',
      help: 'Total number of errors',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.errorByType = new Counter({
      name: 'mcp_errors_by_type_total',
      help: 'Total number of errors by type',
      labelNames: ['error_type', 'endpoint'],
      registers: [this.registry],
    });

    this.errorByEndpoint = new Counter({
      name: 'mcp_errors_by_endpoint_total',
      help: 'Total number of errors by endpoint',
      labelNames: ['endpoint', 'error_type'],
      registers: [this.registry],
    });

    // Command execution metrics
    this.commandExecutionTime = new Histogram({
      name: 'mcp_command_execution_time_seconds',
      help: 'Time spent executing commands',
      labelNames: ['command', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.commandExecutionTotal = new Counter({
      name: 'mcp_command_executions_total',
      help: 'Total number of command executions',
      labelNames: ['command', 'status'],
      registers: [this.registry],
    });

    this.commandExecutionErrors = new Counter({
      name: 'mcp_command_execution_errors_total',
      help: 'Total number of command execution errors',
      labelNames: ['command', 'error_type'],
      registers: [this.registry],
    });

    this.commandAllowed = new Counter({
      name: 'mcp_commands_allowed_total',
      help: 'Total number of allowed commands',
      labelNames: ['command'],
      registers: [this.registry],
    });

    this.commandDenied = new Counter({
      name: 'mcp_commands_denied_total',
      help: 'Total number of denied commands',
      labelNames: ['command'],
      registers: [this.registry],
    });

    // Transport metrics
    this.transportMessagesSent = new Counter({
      name: 'mcp_transport_messages_sent_total',
      help: 'Total number of messages sent over transport',
      labelNames: ['transport_type'],
      registers: [this.registry],
    });

    this.transportMessagesReceived = new Counter({
      name: 'mcp_transport_messages_received_total',
      help: 'Total number of messages received over transport',
      labelNames: ['transport_type'],
      registers: [this.registry],
    });

    this.transportErrors = new Counter({
      name: 'mcp_transport_errors_total',
      help: 'Total number of transport errors',
      labelNames: ['transport_type', 'error_type'],
      registers: [this.registry],
    });

    this.transportLatency = new Summary({
      name: 'mcp_transport_latency_seconds',
      help: 'Transport message latency in seconds',
      labelNames: ['transport_type', 'direction'],
      percentiles: [0.5, 0.9, 0.95, 0.99],
      registers: [this.registry],
    });

    // System metrics
    this.memoryUsage = new Gauge({
      name: 'mcp_process_memory_bytes',
      help: 'Process memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.cpuUsage = new Gauge({
      name: 'mcp_process_cpu_usage_percent',
      help: 'Process CPU usage percentage',
      registers: [this.registry],
    });

    this.eventLoopLag = new Gauge({
      name: 'mcp_event_loop_lag_seconds',
      help: 'Event loop lag in seconds',
      registers: [this.registry],
    });

    this.activeHandles = new Gauge({
      name: 'mcp_active_handles',
      help: 'Number of active handles',
      registers: [this.registry],
    });

    this.activeRequests = new Gauge({
      name: 'mcp_active_requests',
      help: 'Number of active requests',
      registers: [this.registry],
    });

    this.heapSize = new Gauge({
      name: 'mcp_heap_size_bytes',
      help: 'Heap size in bytes',
      registers: [this.registry],
    });

    this.heapUsed = new Gauge({
      name: 'mcp_heap_used_bytes',
      help: 'Heap used in bytes',
      registers: [this.registry],
    });

    // Performance metrics
    this.requestQueueSize = new Gauge({
      name: 'mcp_request_queue_size',
      help: 'Current request queue size',
      registers: [this.registry],
    });

    this.responseTimePercentile = new Summary({
      name: 'mcp_response_time_seconds',
      help: 'Response time in seconds',
      percentiles: [0.5, 0.9, 0.95, 0.99],
      registers: [this.registry],
    });

    this.throughput = new Counter({
      name: 'mcp_throughput_total',
      help: 'Total throughput in requests',
      registers: [this.registry],
    });

    // Start collecting metrics
    this.startSystemMetricsCollection();
    this.startCustomMetricsCollection();
  }

  private startSystemMetricsCollection() {
    setInterval(() => {
      try {
        // Memory usage
        const memUsage = process.memoryUsage();
        this.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
        this.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
        this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
        this.memoryUsage.set({ type: 'external' }, memUsage.external);
        this.heapSize.set(memUsage.heapTotal);
        this.heapUsed.set(memUsage.heapUsed);

        // CPU usage
        const cpuUsage = process.cpuUsage();
        const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000;
        this.cpuUsage.set(totalUsage);

        // Active handles and requests
        const activeHandles = (
          process as unknown as { _getActiveHandles: () => unknown[] }
        )._getActiveHandles().length;
        const activeRequests = (
          process as unknown as { _getActiveRequests: () => unknown[] }
        )._getActiveRequests().length;
        this.activeHandles.set(activeHandles);
        this.activeRequests.set(activeRequests);
      } catch (error) {
        logger.error('Error collecting system metrics', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 10000); // Every 10 seconds
  }

  private startCustomMetricsCollection() {
    setInterval(() => {
      try {
        // Connection pool metrics
        const poolStats = connectionPool.getStats();
        this.connectionPoolSize.set({ type: 'total' }, poolStats.currentSessions);

        for (const [type, count] of Object.entries(poolStats.sessionsByType)) {
          this.connectionPoolSize.set({ type }, count);
        }

        this.connectionPoolMaxSize.set(poolStats.maxConcurrentSessions);

        // Circuit breaker metrics
        const commandState = commandCircuitBreaker.getState();
        const transportState = transportCircuitBreaker.getState();
        const sessionState = sessionCircuitBreaker.getState();

        this.circuitBreakerState.set(
          { breaker_name: 'command' },
          this.getStateValue(commandState.state)
        );
        this.circuitBreakerState.set(
          { breaker_name: 'transport' },
          this.getStateValue(transportState.state)
        );
        this.circuitBreakerState.set(
          { breaker_name: 'session' },
          this.getStateValue(sessionState.state)
        );

        this.circuitBreakerFailures.set({ breaker_name: 'command' }, commandState.failures);
        this.circuitBreakerFailures.set({ breaker_name: 'transport' }, transportState.failures);
        this.circuitBreakerFailures.set({ breaker_name: 'session' }, sessionState.failures);
      } catch (error) {
        logger.error('Error collecting custom metrics', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 5000); // Every 5 seconds
  }

  private getStateValue(state: string): number {
    switch (state) {
      case 'CLOSED':
        return 0;
      case 'HALF_OPEN':
        return 1;
      case 'OPEN':
        return 2;
      default:
        return -1;
    }
  }

  // Helper methods to update metrics
  public recordSessionCreated(type: 'bridge' | 'agent') {
    this.sessionCreationRate.inc({ type });
    this.activeSessions.inc({ type });
  }

  public recordSessionClosed(type: 'bridge' | 'agent', duration: number) {
    this.activeSessions.dec({ type });
    this.sessionDuration.observe({ type }, duration);
  }

  public recordError(errorType: string, endpoint?: string) {
    this.errorTotal.inc({ type: errorType });
    if (endpoint) {
      this.errorByEndpoint.inc({ endpoint, error_type: errorType });
      this.errorByType.inc({ error_type: errorType, endpoint });
    }
  }

  public recordRetryAttempt(operation: string, success: boolean) {
    this.retryAttemptsTotal.inc({ operation, result: success ? 'success' : 'failure' });
    if (success) {
      this.retrySuccessTotal.inc({ operation });
    } else {
      this.retryFailureTotal.inc({ operation });
    }
  }

  public recordCommandExecution(command: string, duration: number, success: boolean) {
    this.commandExecutionTotal.inc({ command, status: success ? 'success' : 'error' });
    this.commandExecutionTime.observe({ command, status: success ? 'success' : 'error' }, duration);
    if (!success) {
      this.commandExecutionErrors.inc({ command, error_type: 'execution' });
    }
  }

  public recordTransportMessage(
    transportType: string,
    direction: 'sent' | 'received',
    latency?: number
  ) {
    if (direction === 'sent') {
      this.transportMessagesSent.inc({ transport_type: transportType });
    } else {
      this.transportMessagesReceived.inc({ transport_type: transportType });
    }

    if (latency !== undefined) {
      this.transportLatency.observe({ transport_type: transportType, direction }, latency);
    }
  }

  public recordCircuitBreakerTransition(breakerName: string, fromState: string, toState: string) {
    this.circuitBreakerTransitions.inc({
      breaker_name: breakerName,
      from_state: fromState,
      to_state: toState,
    });
  }

  public recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    endpoint?: string
  ) {
    this.httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
      endpoint: endpoint || 'unknown',
    });
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString(), endpoint: endpoint || 'unknown' },
      duration
    );
    this.throughput.inc();
  }

  public recordHttpError(method: string, route: string, errorType: string, endpoint?: string) {
    this.httpRequestErrors.inc({
      method,
      route,
      error_type: errorType,
      endpoint: endpoint || 'unknown',
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

// Singleton instance
export const enhancedMetrics = new EnhancedMetricsCollector();
