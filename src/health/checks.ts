export interface HealthCheck {
  status: 'pass' | 'fail';
  responseTime?: number;
  error?: string;
}

interface GlobalWithSessionCount {
  getSessionCount?: () => number;
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

export class HealthChecker {
  private startTime = Date.now();

  async checkHealth(): Promise<HealthCheckResult> {
    const checks = {
      memory: await this.checkMemory(),
      disk: await this.checkDisk(),
      sessions: this.checkSessions(),
    };

    const allPassed = Object.values(checks).every((c) => c.status === 'pass');
    const anyFailed = Object.values(checks).some((c) => c.status === 'fail');

    return {
      status: anyFailed ? 'unhealthy' : allPassed ? 'healthy' : 'degraded',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkMemory(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const usage = process.memoryUsage();
      const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

      return {
        status: heapUsedPercent < 85 ? 'pass' : 'fail',
        responseTime: Date.now() - start,
        error: heapUsedPercent >= 85 ? 'High memory usage' : undefined,
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkDisk(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const fs = await import('fs/promises');
      // Try to write a test file
      await fs.writeFile('/tmp/mcp-health-check', 'test');
      await fs.unlink('/tmp/mcp-health-check');

      return {
        status: 'pass',
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private checkSessions(): HealthCheck {
    const start = Date.now();
    try {
      // This will be injected by the main app
      const totalSessions = (global as unknown as GlobalWithSessionCount).getSessionCount?.() || 0;
      const maxSessions = parseInt(process.env.MAX_SESSIONS || '100');

      return {
        status: totalSessions < maxSessions ? 'pass' : 'fail',
        responseTime: Date.now() - start,
        error: totalSessions >= maxSessions ? 'Max sessions reached' : undefined,
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
