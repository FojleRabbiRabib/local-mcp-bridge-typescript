import { Request, Response, NextFunction } from 'express';
import { metrics } from '../metrics/prometheus.js';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // Capture response
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;

    metrics.httpRequestDuration.observe(
      { method: req.method, route, status: res.statusCode.toString() },
      duration
    );

    metrics.httpRequestTotal.inc({
      method: req.method,
      route,
      status: res.statusCode.toString(),
    });
  });

  next();
}

// Helper to track tool execution
export function trackToolExecution(toolName: string) {
  const start = Date.now();

  return {
    success: () => {
      const duration = (Date.now() - start) / 1000;
      metrics.toolExecutionDuration.observe({ tool: toolName, status: 'success' }, duration);
      metrics.toolExecutionTotal.inc({ tool: toolName, status: 'success' });
    },

    error: (errorType: string) => {
      const duration = (Date.now() - start) / 1000;
      metrics.toolExecutionDuration.observe({ tool: toolName, status: 'error' }, duration);
      metrics.toolExecutionTotal.inc({ tool: toolName, status: 'error' });
      metrics.toolExecutionErrors.inc({ tool: toolName, error_type: errorType });
    },
  };
}
