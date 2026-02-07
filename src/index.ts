import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { createAgentServer } from './server/agent.js';
import { loadConfig } from './config/loader.js';
import { logger, logContext } from './utils/logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { validateQuery, validateBody, schemas } from './middleware/validator.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { metrics } from './metrics/prometheus.js';
import { HealthChecker } from './health/checks.js';
import { GracefulShutdown } from './utils/shutdown.js';

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || 'localhost',
  allowedCommands: process.env.ALLOWED_COMMANDS?.split(',') || [
    'php',
    'python',
    'python3',
    'node',
    'npx',
    'uvx',
    'deno',
  ],
};

interface BridgeSession {
  sessionId: string;
  process: ChildProcess;
  sseTransport: SSEServerTransport;
  stdioTransport: StdioServerTransport;
}

interface AgentSession {
  sessionId: string;
  sseTransport: SSEServerTransport;
}

const app = express();
const sessions = new Map<string, BridgeSession>();
const agentSessions = new Map<string, AgentSession>();
const healthChecker = new HealthChecker();

// Make session count available to health checker
interface GlobalWithSessionCount {
  getSessionCount?: () => number;
}

(global as unknown as GlobalWithSessionCount).getSessionCount = () =>
  sessions.size + agentSessions.size;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ type: '*/*' }));
app.use(requestIdMiddleware);
app.use(metricsMiddleware);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', logContext.error(err, { requestId: req.id, path: req.path }));

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id,
  });
});

// GET /sse - Establish SSE connection and spawn MCP process
app.get('/sse', validateQuery(schemas.sseQuery), async (req: Request, res: Response) => {
  const command = req.query.command as string;
  const argsStr = req.query.args as string;
  const cwd = req.query.cwd as string;

  if (!config.allowedCommands.includes(command)) {
    logger.warn('Command not allowed', { command, requestId: req.id });
    return res.status(403).json({ error: `Command "${command}" is not allowed` });
  }

  const args: string[] = argsStr ? JSON.parse(argsStr) : [];
  const workingDir = cwd || process.cwd();

  try {
    logger.info('Starting bridge session', { command, args, cwd: workingDir, requestId: req.id });

    const proc = spawn(command, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const sseTransport = new SSEServerTransport('/sse', res);
    const stdioTransport = new StdioServerTransport(proc.stdout, proc.stdin);

    const session: BridgeSession = {
      sessionId: sseTransport.sessionId,
      process: proc,
      sseTransport,
      stdioTransport,
    };

    sessions.set(session.sessionId, session);
    metrics.activeSessions.set({ type: 'bridge' }, sessions.size);

    logger.info(
      'Bridge session created',
      logContext.session(session.sessionId, { command, requestId: req.id })
    );

    sseTransport.onmessage = async (message: JSONRPCMessage) => {
      try {
        await stdioTransport.send(message);
      } catch (error) {
        logger.error(
          'Error forwarding to process',
          logContext.error(error, { sessionId: session.sessionId })
        );
      }
    };

    stdioTransport.onmessage = async (message: JSONRPCMessage) => {
      try {
        await sseTransport.send(message);
      } catch (error) {
        logger.error(
          'Error forwarding to browser',
          logContext.error(error, { sessionId: session.sessionId })
        );
      }
    };

    proc.on('exit', (code) => {
      logger.info('Process exited', { sessionId: session.sessionId, exitCode: code });
      sessions.delete(session.sessionId);
      metrics.activeSessions.set({ type: 'bridge' }, sessions.size);
      sseTransport.close().catch(() => {});
    });

    proc.on('error', (error) => {
      logger.error('Process error', logContext.error(error, { sessionId: session.sessionId }));
      sessions.delete(session.sessionId);
      metrics.activeSessions.set({ type: 'bridge' }, sessions.size);
      sseTransport.close().catch(() => {});
    });

    sseTransport.onclose = () => {
      logger.info('SSE connection closed', { sessionId: session.sessionId });
      proc.kill('SIGTERM');
      sessions.delete(session.sessionId);
      metrics.activeSessions.set({ type: 'bridge' }, sessions.size);
    };

    stdioTransport.onerror = (error) => {
      logger.error(
        'Stdio transport error',
        logContext.error(error, { sessionId: session.sessionId })
      );
    };

    sseTransport.onerror = (error) => {
      logger.error(
        'SSE transport error',
        logContext.error(error, { sessionId: session.sessionId })
      );
    };

    await sseTransport.start();
    await stdioTransport.start();
  } catch (error) {
    logger.error('Error setting up bridge session', logContext.error(error, { requestId: req.id }));
    if (!res.headersSent) {
      return res.status(500).json({ error: String(error), requestId: req.id });
    }
  }
});

// POST /sse
app.post(
  '/sse',
  validateQuery(schemas.sessionQuery),
  validateBody(schemas.jsonrpcBody),
  async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;

    const session = sessions.get(sessionId);
    if (!session) {
      logger.warn('Session not found', { sessionId, requestId: req.id });
      return res.status(404).json({ error: 'Session not found', requestId: req.id });
    }

    if (!session.process || session.process.killed) {
      logger.warn('Process not running', { sessionId, requestId: req.id });
      return res.status(503).json({ error: 'Process not running', requestId: req.id });
    }

    try {
      await session.sseTransport.handlePostMessage(req, res, req.body);
    } catch (error) {
      logger.error(
        'Error handling POST',
        logContext.error(error, { sessionId, requestId: req.id })
      );
      if (!res.headersSent) {
        return res.status(500).json({ error: String(error), requestId: req.id });
      }
    }
  }
);

// GET /agent
app.get('/agent', validateQuery(schemas.agentQuery), async (req: Request, res: Response) => {
  const workspace = req.query.workspace as string;

  try {
    logger.info('Starting agent session', { workspace, requestId: req.id });

    const agentConfig = await loadConfig(workspace);
    const server = createAgentServer(agentConfig);
    const sseTransport = new SSEServerTransport('/agent', res);

    const session: AgentSession = {
      sessionId: sseTransport.sessionId,
      sseTransport,
    };

    agentSessions.set(session.sessionId, session);
    metrics.activeSessions.set({ type: 'agent' }, agentSessions.size);

    logger.info(
      'Agent session created',
      logContext.session(session.sessionId, { workspace, requestId: req.id })
    );

    sseTransport.onclose = () => {
      logger.info('Agent SSE connection closed', { sessionId: session.sessionId });
      agentSessions.delete(session.sessionId);
      metrics.activeSessions.set({ type: 'agent' }, agentSessions.size);
    };

    sseTransport.onerror = (error) => {
      logger.error('Agent SSE error', logContext.error(error, { sessionId: session.sessionId }));
    };

    await server.connect(sseTransport);
  } catch (error) {
    logger.error('Error setting up agent session', logContext.error(error, { requestId: req.id }));
    if (!res.headersSent) {
      return res.status(500).json({ error: String(error), requestId: req.id });
    }
  }
});

// POST /agent
app.post(
  '/agent',
  validateQuery(schemas.sessionQuery),
  validateBody(schemas.jsonrpcBody),
  async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;

    const session = agentSessions.get(sessionId);
    if (!session) {
      logger.warn('Agent session not found', { sessionId, requestId: req.id });
      return res.status(404).json({ error: 'Session not found', requestId: req.id });
    }

    try {
      await session.sseTransport.handlePostMessage(req, res, req.body);
    } catch (error) {
      logger.error(
        'Error handling agent POST',
        logContext.error(error, { sessionId, requestId: req.id })
      );
      if (!res.headersSent) {
        return res.status(500).json({ error: String(error), requestId: req.id });
      }
    }
  }
);

// Health endpoints
app.get('/health/live', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const health = await healthChecker.checkHealth();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

app.get('/health', async (_req: Request, res: Response) => {
  const health = await healthChecker.checkHealth();
  res.json({
    ...health,
    sessions: {
      bridge: sessions.size,
      agent: agentSessions.size,
      total: sessions.size + agentSessions.size,
    },
  });
});

// Metrics endpoint
app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', metrics.registry.contentType);
    res.end(await metrics.getMetrics());
  } catch (error) {
    logger.error('Error generating metrics', logContext.error(error));
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// Start server
const server = app.listen(config.port, config.host, () => {
  logger.info('Server started', {
    host: config.host,
    port: config.port,
    environment: process.env.NODE_ENV || 'development',
  });

  console.log(`\n========================================`);
  console.log(`MCP SSE Bridge v1.0.0 (Enterprise Edition)`);
  console.log(`Running at: http://${config.host}:${config.port}`);
  console.log(`\n--- Monitoring Endpoints ---`);
  console.log(`  Health:     http://${config.host}:${config.port}/health`);
  console.log(`  Ready:      http://${config.host}:${config.port}/health/ready`);
  console.log(`  Metrics:    http://${config.host}:${config.port}/metrics`);
  console.log(`\n--- Bridge Mode ---`);
  console.log(
    `  http://${config.host}:${config.port}/sse?command=php&args=["artisan","boost:mcp"]&cwd=/path`
  );
  console.log(`\n--- Agent Mode ---`);
  console.log(`  http://${config.host}:${config.port}/agent?workspace=/path/to/project`);
  console.log(`\n--- Features ---`);
  console.log(`  ✅ Structured logging (logs/combined.log)`);
  console.log(`  ✅ Request ID tracking`);
  console.log(`  ✅ Input validation`);
  console.log(`  ✅ Prometheus metrics`);
  console.log(`  ✅ Health checks`);
  console.log(`  ✅ Graceful shutdown`);
  console.log(`========================================\n`);
});

// Graceful shutdown
new GracefulShutdown(server, async () => {
  logger.info('Closing all sessions...');

  for (const [sessionId, session] of sessions) {
    try {
      session.process.kill('SIGTERM');
      await session.sseTransport.close();
      await session.stdioTransport.close();
    } catch (error) {
      logger.error('Error closing bridge session', logContext.error(error, { sessionId }));
    }
  }

  for (const [sessionId, session] of agentSessions) {
    try {
      await session.sseTransport.close();
    } catch (error) {
      logger.error('Error closing agent session', logContext.error(error, { sessionId }));
    }
  }

  sessions.clear();
  agentSessions.clear();
  logger.info('All sessions closed successfully');
});
