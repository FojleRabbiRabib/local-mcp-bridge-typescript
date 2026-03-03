import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { CommandValidator } from '../security/command-validator.js';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';

export function registerCommandTools(
  server: McpServer,
  commandValidator: CommandValidator,
  pathValidator: PathValidator,
  commandTimeout: number,
  workspace: string
) {
  // Workspace is now required - always use it as the default cwd
  const defaultCwd = workspace;

  // execute_command tool - Execute a shell command
  server.registerTool(
    'execute_command',
    {
      description:
        'Execute a shell command with arguments. Command must be in the allowed list. USE THIS as a last resort when no specific tool is available for the task.',
      inputSchema: z.object({
        command: z.string().describe('Command to execute (must be in allowed list)'),
        args: z.array(z.string()).optional().describe('Command arguments'),
        cwd: z
          .string()
          .optional()
          .describe('Working directory for the command (default: workspace root)'),
      }),
    },
    async ({ command, args = [], cwd = defaultCwd }) => {
      // Validate command
      const cmdValidation = commandValidator.validate(command);
      if (!cmdValidation.valid) {
        return {
          content: [{ type: 'text', text: cmdValidation.error! }],
          isError: true,
        };
      }

      // Validate working directory
      const pathValidation = pathValidator.validate(cwd);
      if (!pathValidation.valid) {
        return {
          content: [{ type: 'text', text: pathValidation.error! }],
          isError: true,
        };
      }

      const absoluteCwd = pathValidation.resolvedPath!;
      return new Promise((resolve) => {
        let resolved = false;
        const proc = spawn(command, args, {
          cwd: absoluteCwd,
          timeout: commandTimeout,
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
          if (resolved) return;
          resolved = true;

          const output = stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '');
          resolve({
            content: [
              {
                type: 'text',
                text: `Exit code: ${code}\n\n${output || '(no output)'}`,
              },
            ],
          });
        });

        proc.on('error', (error) => {
          if (resolved) return;
          resolved = true;

          resolve({
            content: [{ type: 'text', text: `Error executing command: ${error.message}` }],
            isError: true,
          });
        });

        proc.on('timeout', () => {
          if (resolved) return;
          resolved = true;
          proc.kill();
          resolve({
            content: [{ type: 'text', text: `Command timed out after ${commandTimeout}ms` }],
            isError: true,
          });
        });
      });
    }
  );
}
