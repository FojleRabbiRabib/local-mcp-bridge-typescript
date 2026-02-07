import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

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

const app = express();
const sessions = new Map<string, BridgeSession>();

app.use(cors({ origin: '*' }));
app.use(express.json({ type: '*/*' }));

// GET /sse - Establish SSE connection and spawn MCP process
app.get('/sse', async (req: Request, res: Response) => {
  const command = req.query.command as string;
  const argsStr = req.query.args as string;
  const cwd = req.query.cwd as string;

  if (!command) {
    return res.status(400).json({ error: 'Missing command parameter' });
  }

  if (!config.allowedCommands.includes(command)) {
    return res.status(403).json({ error: `Command "${command}" is not allowed` });
  }

  const args: string[] = argsStr ? JSON.parse(argsStr) : [];
  const workingDir = cwd || process.cwd();

  try {
    // Spawn the MCP server process
    const proc = spawn(command, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    // Create SSE transport for browser communication
    const sseTransport = new SSEServerTransport('/sse', res);

    // Create stdio transport for process communication
    const stdioTransport = new StdioServerTransport(proc.stdout, proc.stdin);

    const session: BridgeSession = {
      sessionId: sseTransport.sessionId,
      process: proc,
      sseTransport,
      stdioTransport,
    };

    sessions.set(session.sessionId, session);

    // Bridge: Forward messages from browser to process
    sseTransport.onmessage = async (message: JSONRPCMessage) => {
      try {
        await stdioTransport.send(message);
      } catch (error) {
        console.error(`[Bridge] Error forwarding to process:`, error);
      }
    };

    // Bridge: Forward messages from process to browser
    stdioTransport.onmessage = async (message: JSONRPCMessage) => {
      try {
        await sseTransport.send(message);
      } catch (error) {
        console.error(`[Bridge] Error forwarding to browser:`, error);
      }
    };

    // Handle process exit
    proc.on('exit', () => {
      sessions.delete(session.sessionId);
      sseTransport.close().catch(() => {});
    });

    proc.on('error', (error) => {
      console.error(`[Bridge] Process error:`, error);
      sessions.delete(session.sessionId);
      sseTransport.close().catch(() => {});
    });

    // Handle SSE connection close
    sseTransport.onclose = () => {
      proc.kill('SIGTERM');
      sessions.delete(session.sessionId);
    };

    // Handle stdio transport errors
    stdioTransport.onerror = (error) => {
      console.error(`[Bridge] Stdio error:`, error);
    };

    // Handle SSE transport errors
    sseTransport.onerror = (error) => {
      console.error(`[Bridge] SSE error:`, error);
    };

    // Start both transports
    await sseTransport.start();
    await stdioTransport.start();
  } catch (error) {
    console.error('[Bridge] Error setting up session:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: String(error) });
    }
  }
});

// POST /sse - Handle incoming messages from browser
app.post('/sse', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!session.process || session.process.killed) {
    return res.status(503).json({ error: 'Process not running' });
  }

  try {
    // Let the SSE transport handle the POST message
    await session.sseTransport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error('[Bridge] Error handling POST:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: String(error) });
    }
  }
});

// GET /health - Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    sessions: Array.from(sessions.keys()),
  });
});

// Start server
app.listen(config.port, config.host, () => {
  console.log(`\n========================================`);
  console.log(`MCP SSE Bridge (using official SDK)`);
  console.log(`Running at: http://${config.host}:${config.port}/sse`);
  console.log(`Health: http://${config.host}:${config.port}/health`);
  console.log(`\nTo connect from extension:`);
  console.log(`  Transport: SSE`);
  console.log(
    `  URL: http://${config.host}:${config.port}/sse?command=COMMAND&args=["ARG1","ARG2"]&cwd=/path/to/project`
  );
  console.log(`\nExample for Laravel Boost:`);
  console.log(
    `  http://localhost:3000/sse?command=php&args=["artisan","boost:mcp"]&cwd=/path/to/laravel`
  );
  console.log(`\nAllowed commands: ${config.allowedCommands.join(', ')}`);
  console.log(`========================================\n`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  for (const [, session] of sessions) {
    try {
      session.process.kill('SIGTERM');
      await session.sseTransport.close();
      await session.stdioTransport.close();
    } catch (error) {
      console.error(`[Bridge] Error closing session:`, error);
    }
  }

  sessions.clear();
  process.exit(0);
});
