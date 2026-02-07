import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';

export function registerGitTools(
  server: McpServer,
  validator: PathValidator,
  commandTimeout: number
) {
  // git_status tool - Show working tree status
  server.registerTool(
    'git_status',
    {
      description: 'Show the working tree status (git status)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
      }),
    },
    async ({ path: repoPath = '.' }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      return executeGitCommand(['status'], repoPath, commandTimeout);
    }
  );

  // git_log tool - Show commit history
  server.registerTool(
    'git_log',
    {
      description: 'Show commit history (git log)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        limit: z.number().optional().describe('Number of commits to show (default: 10)'),
        oneline: z.boolean().optional().describe('Show one line per commit'),
      }),
    },
    async ({ path: repoPath = '.', limit = 10, oneline = false }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const args = ['log', `-${limit}`];
      if (oneline) {
        args.push('--oneline');
      }

      return executeGitCommand(args, repoPath, commandTimeout);
    }
  );

  // git_diff tool - Show changes
  server.registerTool(
    'git_diff',
    {
      description: 'Show changes between commits, commit and working tree, etc (git diff)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        cached: z.boolean().optional().describe('Show staged changes'),
        file: z.string().optional().describe('Show diff for specific file'),
      }),
    },
    async ({ path: repoPath = '.', cached = false, file }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const args = ['diff'];
      if (cached) {
        args.push('--cached');
      }
      if (file) {
        args.push(file);
      }

      return executeGitCommand(args, repoPath, commandTimeout);
    }
  );

  // git_show tool - Show commit details
  server.registerTool(
    'git_show',
    {
      description: 'Show various types of objects (git show)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        commit: z.string().optional().describe('Commit hash or reference (default: HEAD)'),
      }),
    },
    async ({ path: repoPath = '.', commit = 'HEAD' }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      return executeGitCommand(['show', commit], repoPath, commandTimeout);
    }
  );

  // git_branch tool - List, create, or delete branches
  server.registerTool(
    'git_branch',
    {
      description: 'List branches (git branch)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        all: z.boolean().optional().describe('List all branches including remote'),
      }),
    },
    async ({ path: repoPath = '.', all = false }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const args = ['branch'];
      if (all) {
        args.push('-a');
      }

      return executeGitCommand(args, repoPath, commandTimeout);
    }
  );

  // git_add tool - Add file contents to the index
  server.registerTool(
    'git_add',
    {
      description: 'Add file contents to the staging area (git add)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        files: z.array(z.string()).describe('Files to add'),
      }),
    },
    async ({ path: repoPath = '.', files }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      if (!files || files.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: No files specified' }],
          isError: true,
        };
      }

      return executeGitCommand(['add', ...files], repoPath, commandTimeout);
    }
  );

  // git_commit tool - Record changes to the repository
  server.registerTool(
    'git_commit',
    {
      description: 'Record changes to the repository (git commit)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        message: z.string().describe('Commit message'),
        amend: z.boolean().optional().describe('Amend the previous commit'),
      }),
    },
    async ({ path: repoPath = '.', message, amend = false }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      if (!message) {
        return {
          content: [{ type: 'text', text: 'Error: Commit message is required' }],
          isError: true,
        };
      }

      const args = ['commit', '-m', message];
      if (amend) {
        args.push('--amend');
      }

      return executeGitCommand(args, repoPath, commandTimeout);
    }
  );

  // git_checkout tool - Switch branches or restore working tree files
  server.registerTool(
    'git_checkout',
    {
      description: 'Switch branches or restore working tree files (git checkout)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        branch: z.string().describe('Branch name to checkout'),
        create: z.boolean().optional().describe('Create new branch'),
      }),
    },
    async ({ path: repoPath = '.', branch, create = false }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      if (!branch) {
        return {
          content: [{ type: 'text', text: 'Error: Branch name is required' }],
          isError: true,
        };
      }

      const args = ['checkout'];
      if (create) {
        args.push('-b');
      }
      args.push(branch);

      return executeGitCommand(args, repoPath, commandTimeout);
    }
  );

  // git_pull tool - Fetch from and integrate with another repository or a local branch
  server.registerTool(
    'git_pull',
    {
      description: 'Fetch from and integrate with another repository (git pull)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        remote: z.string().optional().describe('Remote name (default: origin)'),
        branch: z.string().optional().describe('Branch name'),
      }),
    },
    async ({ path: repoPath = '.', remote = 'origin', branch }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const args = ['pull', remote];
      if (branch) {
        args.push(branch);
      }

      return executeGitCommand(args, repoPath, commandTimeout);
    }
  );

  // git_push tool - Update remote refs along with associated objects
  server.registerTool(
    'git_push',
    {
      description: 'Update remote refs along with associated objects (git push)',
      inputSchema: z.object({
        path: z.string().optional().describe('Repository path (default: current directory)'),
        remote: z.string().optional().describe('Remote name (default: origin)'),
        branch: z.string().optional().describe('Branch name'),
        force: z.boolean().optional().describe('Force push'),
      }),
    },
    async ({ path: repoPath = '.', remote = 'origin', branch, force = false }) => {
      const validation = validator.validate(repoPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const args = ['push', remote];
      if (branch) {
        args.push(branch);
      }
      if (force) {
        args.push('--force');
      }

      return executeGitCommand(args, repoPath, commandTimeout);
    }
  );
}

// Helper function to execute git commands
function executeGitCommand(
  args: string[],
  cwd: string,
  timeout: number
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      cwd,
      timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          content: [{ type: 'text' as const, text: stdout || '(no output)' }],
        });
      } else {
        resolve({
          content: [
            { type: 'text' as const, text: `Error (exit code ${code}):\n${stderr || stdout}` },
          ],
          isError: true,
        });
      }
    });

    proc.on('error', (error) => {
      resolve({
        content: [{ type: 'text' as const, text: `Error executing git: ${error.message}` }],
        isError: true,
      });
    });
  });
}
