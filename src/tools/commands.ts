import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { CommandValidator } from '../security/command-validator.js';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';

export function registerCommandTools(
  server: McpServer,
  commandValidator: CommandValidator,
  pathValidator: PathValidator,
  commandTimeout: number
) {
  // execute_command tool - Execute a shell command
  server.registerTool(
    'execute_command',
    {
      description:
        'Execute a shell command with arguments. Command must be in the allowed list. USE THIS as a last resort when no specific tool is available for the task.',
      inputSchema: z.object({
        command: z.string().describe('Command to execute (must be in allowed list)'),
        args: z.array(z.string()).optional().describe('Command arguments'),
        cwd: z.string().optional().describe('Working directory for the command'),
      }),
    },
    async ({ command, args = [], cwd }) => {
      // Validate command
      const cmdValidation = commandValidator.validate(command);
      if (!cmdValidation.valid) {
        return {
          content: [{ type: 'text', text: cmdValidation.error! }],
          isError: true,
        };
      }

      // Validate working directory if provided
      if (cwd) {
        const pathValidation = pathValidator.validate(cwd);
        if (!pathValidation.valid) {
          return {
            content: [{ type: 'text', text: pathValidation.error! }],
            isError: true,
          };
        }
      }

      return new Promise((resolve) => {
        const proc = spawn(command, args, {
          cwd: cwd || process.cwd(),
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
          resolve({
            content: [{ type: 'text', text: `Error executing command: ${error.message}` }],
            isError: true,
          });
        });
      });
    }
  );
}
