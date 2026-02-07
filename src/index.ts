import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { createAgentServer } from './server/agent.js';
import { loadConfig } from './config/loader.js';

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

// GET /agent - Agent mode with built-in tools
app.get('/agent', async (req: Request, res: Response) => {
  const workspace = req.query.workspace as string;

  if (!workspace) {
    return res.status(400).json({ error: 'Missing workspace parameter' });
  }

  try {
    // Load configuration for this workspace
    const agentConfig = await loadConfig(workspace);

    // Create agent server with built-in tools
    const server = createAgentServer(agentConfig);

    // Create SSE transport for browser communication
    const sseTransport = new SSEServerTransport('/agent', res);

    const session: AgentSession = {
      sessionId: sseTransport.sessionId,
      sseTransport,
    };

    agentSessions.set(session.sessionId, session);

    // Handle SSE connection close
    sseTransport.onclose = () => {
      agentSessions.delete(session.sessionId);
    };

    // Handle SSE transport errors
    sseTransport.onerror = (error) => {
      console.error(`[Agent] SSE error:`, error);
    };

    // Connect server to transport
    await server.connect(sseTransport);

    console.log(`[Agent] Session started: ${session.sessionId} (workspace: ${workspace})`);
  } catch (error) {
    console.error('[Agent] Error setting up session:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: String(error) });
    }
  }
});

// POST /agent - Handle incoming messages from browser (agent mode)
app.post('/agent', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const session = agentSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    // Let the SSE transport handle the POST message
    await session.sseTransport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error('[Agent] Error handling POST:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: String(error) });
    }
  }
});

// GET /health - Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    bridgeSessions: sessions.size,
    agentSessions: agentSessions.size,
    sessions: {
      bridge: Array.from(sessions.keys()),
      agent: Array.from(agentSessions.keys()),
    },
  });
});

// Start server
app.listen(config.port, config.host, () => {
  console.log(`\n========================================`);
  console.log(`MCP SSE Bridge (using official SDK)`);
  console.log(`Running at: http://${config.host}:${config.port}`);
  console.log(`Health: http://${config.host}:${config.port}/health`);
  console.log(`\n--- Bridge Mode (External MCP Servers) ---`);
  console.log(`  Endpoint: /sse`);
  console.log(
    `  URL: http://${config.host}:${config.port}/sse?command=COMMAND&args=["ARG1","ARG2"]&cwd=/path/to/project`
  );
  console.log(`\n  Example for Laravel Boost:`);
  console.log(
    `    http://localhost:3000/sse?command=php&args=["artisan","boost:mcp"]&cwd=/path/to/laravel`
  );
  console.log(`\n  Allowed commands: ${config.allowedCommands.join(', ')}`);
  console.log(`\n--- Agent Mode (Built-in Tools) ---`);
  console.log(`  Endpoint: /agent`);
  console.log(`  URL: http://${config.host}:${config.port}/agent?workspace=/path/to/project`);
  console.log(`\n  Example:`);
  console.log(`    http://localhost:3000/agent?workspace=/home/user/my-project`);
  console.log(`\n  Built-in tools:`);
  console.log(`    File: read_file, write_file, list_directory, edit_file, replace_lines,`);
  console.log(`          insert_lines, delete_lines, create_directory, delete_file, search_files`);
  console.log(`    Command: execute_command`);
  console.log(`    Git: git_status, git_log, git_diff, git_show, git_branch, git_add,`);
  console.log(`         git_commit, git_checkout, git_pull, git_push`);
  console.log(`    Project: get_project_structure, analyze_project, find_files, get_file_info`);
  console.log(`    Formatting: format_code, lint_code, fix_lint_issues, check_syntax`);
  console.log(`    Package Managers: npm_install, npm_run, pip_install, composer_install,`);
  console.log(`                      artisan, django_manage, cargo_build, go_build`);
  console.log(`    Tasks: create_task, list_tasks, update_task, delete_task, search_todos`);
  console.log(`    ML/AI: jupyter_run, python_venv_create, conda_env_create, conda_env_list,`);
  console.log(`           pip_freeze, check_gpu, dataset_info, model_info`);
  console.log(`========================================\n`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Closing all sessions...');

  // Close bridge sessions
  for (const [, session] of sessions) {
    try {
      session.process.kill('SIGTERM');
      await session.sseTransport.close();
      await session.stdioTransport.close();
    } catch (error) {
      console.error(`[Bridge] Error closing session:`, error);
    }
  }

  // Close agent sessions
  for (const [, session] of agentSessions) {
    try {
      await session.sseTransport.close();
    } catch (error) {
      console.error(`[Agent] Error closing session:`, error);
    }
  }

  sessions.clear();
  agentSessions.clear();
  console.log('[Shutdown] All sessions closed');
  process.exit(0);
});
