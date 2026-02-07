import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { Readable } from 'stream';

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || 'localhost',
  allowedCommands: process.env.ALLOWED_COMMANDS?.split(',') || [
    'php', 'python', 'python3', 'node', 'npx', 'uvx', 'deno'
  ]
};

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

interface ProxySession {
  sessionId: string;
  process: any;
  stdin: any;
  stdout: Readable;
  pendingRequests: Map<string | number, PendingRequest>;
  messageQueue: string[];
}

const app = express();
const sessions = new Map<string, ProxySession>();

app.use(cors({ origin: '*' }));
app.use(express.json({ type: '*/*' }));

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

  console.log(`[Bridge] Spawning: ${command} ${args.join(' ')} in ${workingDir}`);

  const proc = spawn(command, args, {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const pendingRequests = new Map<string | number, PendingRequest>();
  const messageQueue: string[] = [];

  const session: ProxySession = {
    sessionId,
    process: proc,
    stdin: proc.stdin,
    stdout: proc.stdout,
    pendingRequests,
    messageQueue
  };

  // Handle process exit
  proc.on('exit', (code: any, signal: any) => {
    console.log(`[Bridge] Process ${sessionId} exited: code=${code}, signal=${signal}`);
    // Reject all pending requests
    for (const [id, req] of pendingRequests) {
      req.reject(new Error('Process exited'));
    }
    sessions.delete(sessionId);
  });

  proc.on('error', (error: any) => {
    console.error(`[Bridge] Process ${sessionId} error:`, error);
    // Reject all pending requests
    for (const [id, req] of pendingRequests) {
      req.reject(error);
    }
  });

  // Set up stdout reader BEFORE setting SSE headers
  let buffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep partial line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        // Check if this is a response to a pending request
        if (message.id !== undefined && pendingRequests.has(message.id)) {
          const pending = pendingRequests.get(message.id)!;
          pendingRequests.delete(message.id);
          pending.resolve(message);
        } else {
          // Notification or async message - queue for SSE
          messageQueue.push(JSON.stringify(message));
        }
      } catch (e) {
        console.log(`[Bridge] Non-JSON output:`, line);
      }
    }
  });

  sessions.set(sessionId, session);

  // IMPORTANT: Use res.writeHead() like the weather server SDK does
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });

  // Send endpoint event with sessionId (like SDK does)
  // NOTE: The client expects a relative URL, not absolute
  res.write(`event: endpoint\ndata: /sse?sessionId=${sessionId}\n\n`);

  // Send queued messages every 100ms and keep-alive every 15s
  const sendMessageInterval = setInterval(() => {
    if (messageQueue.length > 0) {
      const messages = messageQueue.splice(0);
      for (const msg of messages) {
        res.write(`event: message\ndata: ${msg}\n\n`);
      }
    }
  }, 100);

  const keepAliveInterval = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  res.on('close', () => {
    clearInterval(sendMessageInterval);
    clearInterval(keepAliveInterval);
    console.log(`[Bridge] Session ${sessionId} closed`);
    proc.kill('SIGTERM');
    sessions.delete(sessionId);
  });
});

app.post('/sse', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const message = req.body;

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

  // Send to stdin
  try {
    const json = JSON.stringify(message) + '\n';
    session.stdin.write(json);

    // Return 202 Accepted immediately - responses go via SSE
    res.status(202).end('Accepted');

    // If request has an ID, queue the response to be sent via SSE
    if (message.id !== undefined) {
      const timeout = setTimeout(() => {
        session.pendingRequests.delete(message.id);
        console.log(`[Bridge] Request ${message.id} timeout`);
      }, 30000);

      session.pendingRequests.set(message.id, {
        resolve: (val: any) => {
          clearTimeout(timeout);
          // Send via SSE message queue
          session.messageQueue.push(JSON.stringify(val));
        },
        reject: (err: any) => {
          clearTimeout(timeout);
          console.error(`[Bridge] Request ${message.id} error:`, err);
        }
      });
    }
  } catch (error) {
    console.error('[Bridge] Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: String(error) });
    }
  }
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size
  });
});

app.listen(config.port, config.host, () => {
  console.log(`\n========================================`);
  console.log(`MCP SSE Bridge`);
  console.log(`Running at: http://${config.host}:${config.port}/sse`);
  console.log(`Health: http://${config.host}:${config.port}/health`);
  console.log(`\nTo connect from extension:`);
  console.log(`  Transport: SSE`);
  console.log(`  URL: http://${config.host}:${config.port}/sse?command=COMMAND&args=["ARG1","ARG2"]&cwd=/path/to/project`);
  console.log(`\nExample for Laravel Boost:`);
  console.log(`  http://localhost:3000/sse?command=php&args=["artisan","boost:mcp"]&cwd=/path/to/laravel`);
  console.log(`========================================\n`);
});
