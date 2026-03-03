export interface HealthCheck {
  status: 'pass' | 'fail';
  responseTime?: number;
  error?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    memory: HealthCheck;
    disk: HealthCheck;
    sessions: HealthCheck;
  };
}
