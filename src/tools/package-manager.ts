import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';
import { ProjectType } from '../detection/project-types.js';

export function registerPackageManagerTools(
  server: McpServer,
  validator: PathValidator,
  commandTimeout: number,
  workspace: string,
  projectTypes?: ProjectType[]
) {
  // Workspace is now required
  const defaultPath = workspace;

  // Helper to check if a tool should be registered based on project types
  const shouldRegister = (types: ProjectType[]): boolean => {
    // If no project types provided, register all tools (backward compatibility)
    if (!projectTypes || projectTypes.length === 0) {
      return true;
    }
    // Check if any of the required types are detected
    return types.some((t) => projectTypes.includes(t));
  };

  // npm_install tool - Install npm dependencies
  if (
    shouldRegister([ProjectType.NODE_JS, ProjectType.REACT, ProjectType.VUE, ProjectType.NEXTJS])
  ) {
    server.registerTool(
      'npm_install',
      {
        description:
          'Install npm dependencies from package.json. Run this after cloning a project or when dependencies change. More efficient than manually running npm install.',
        inputSchema: z.object({
          path: z.string().optional().describe('Project path (default: workspace root)'),
          packages: z.array(z.string()).optional().describe('Specific packages to install'),
          dev: z.boolean().optional().describe('Install as dev dependencies'),
        }),
      },
      async ({ path: projectPath = defaultPath, packages, dev = false }) => {
        const validation = validator.validate(projectPath);
        if (!validation.valid) {
          return {
            content: [{ type: 'text' as const, text: validation.error! }],
            isError: true,
          };
        }

        const args = ['install'];
        if (dev) args.push('--save-dev');
        if (packages && packages.length > 0) args.push(...packages);

        return executeCommand('npm', args, validation.resolvedPath!, commandTimeout);
      }
    );
  }

  // npm_run tool - Run npm scripts
  if (
    shouldRegister([ProjectType.NODE_JS, ProjectType.REACT, ProjectType.VUE, ProjectType.NEXTJS])
  ) {
    server.registerTool(
      'npm_run',
      {
        description:
          'Run any npm script defined in package.json (e.g., build, test, dev). USE THIS to execute project scripts instead of running commands manually.',
        inputSchema: z.object({
          path: z.string().optional().describe('Project path (default: workspace root)'),
          script: z.string().describe('Script name to run'),
        }),
      },
      async ({ path: projectPath = defaultPath, script }) => {
        const validation = validator.validate(projectPath);
        if (!validation.valid) {
          return {
            content: [{ type: 'text' as const, text: validation.error! }],
            isError: true,
          };
        }

        return executeCommand('npm', ['run', script], validation.resolvedPath!, commandTimeout);
      }
    );
  }

  // pip_install tool - Install Python packages
  if (shouldRegister([ProjectType.PYTHON, ProjectType.DJANGO, ProjectType.FLASK])) {
    server.registerTool(
      'pip_install',
      {
        description:
          'Install Python packages. Can install specific packages or all from requirements.txt. USE THIS for Python dependency management.',
        inputSchema: z.object({
          path: z.string().optional().describe('Project path (default: workspace root)'),
          packages: z.array(z.string()).optional().describe('Packages to install'),
          requirements: z.boolean().optional().describe('Install from requirements.txt'),
          pythonVersion: z
            .string()
            .optional()
            .describe(
              'Python version (e.g., "3.8", "3.10"). Uses system default if not specified. Prefered version 3.8.'
            ),
        }),
      },
      async ({
        path: projectPath = defaultPath,
        packages,
        requirements = false,
        pythonVersion,
      }) => {
        const validation = validator.validate(projectPath);
        if (!validation.valid) {
          return {
            content: [{ type: 'text' as const, text: validation.error! }],
            isError: true,
          };
        }

        const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3.8';
        const args = ['-m', 'pip', 'install'];
        if (requirements) {
          args.push('-r', 'requirements.txt');
        } else if (packages && packages.length > 0) {
          args.push(...packages);
        }

        return executeCommand(pythonCmd, args, validation.resolvedPath!, commandTimeout);
      }
    );
  }

  // composer_install tool - Install PHP dependencies
  if (shouldRegister([ProjectType.LARAVEL, ProjectType.PHP])) {
    server.registerTool(
      'composer_install',
      {
        description: 'Install PHP dependencies with Composer',
        inputSchema: z.object({
          path: z.string().optional().describe('Project path (default: workspace root)'),
          dev: z.boolean().optional().describe('Install dev dependencies'),
        }),
      },
      async ({ path: projectPath = defaultPath, dev = false }) => {
        const validation = validator.validate(projectPath);
        if (!validation.valid) {
          return {
            content: [{ type: 'text' as const, text: validation.error! }],
            isError: true,
          };
        }

        const args = ['install'];
        if (!dev) args.push('--no-dev');

        return executeCommand('composer', args, validation.resolvedPath!, commandTimeout);
      }
    );
  }

  // artisan tool - Run Laravel Artisan commands
  if (shouldRegister([ProjectType.LARAVEL])) {
    server.registerTool(
      'artisan',
      {
        description: 'Run Laravel Artisan command',
        inputSchema: z.object({
          path: z.string().optional().describe('Laravel project path (default: workspace root)'),
          command: z.string().describe('Artisan command (e.g., "migrate", "make:model User")'),
        }),
      },
      async ({ path: projectPath = defaultPath, command }) => {
        const validation = validator.validate(projectPath);
        if (!validation.valid) {
          return {
            content: [{ type: 'text' as const, text: validation.error! }],
            isError: true,
          };
        }

        const args = ['artisan', ...command.split(' ')];
        return executeCommand('php', args, validation.resolvedPath!, commandTimeout);
      }
    );
  }

  // django_manage tool - Run Django management commands
  if (shouldRegister([ProjectType.DJANGO])) {
    server.registerTool(
      'django_manage',
      {
        description: 'Run Django management command',
        inputSchema: z.object({
          path: z.string().optional().describe('Django project path (default: workspace root)'),
          command: z.string().describe('Management command (e.g., "migrate", "makemigrations")'),
          pythonVersion: z
            .string()
            .optional()
            .describe(
              'Python version (e.g., "3.8", "3.10"). Uses system default if not specified. Prefered version 3.8.'
            ),
        }),
      },
      async ({ path: projectPath = defaultPath, command, pythonVersion }) => {
        const validation = validator.validate(projectPath);
        if (!validation.valid) {
          return {
            content: [{ type: 'text' as const, text: validation.error! }],
            isError: true,
          };
        }

        const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3.8';
        const args = ['manage.py', ...command.split(' ')];
        return executeCommand(pythonCmd, args, validation.resolvedPath!, commandTimeout);
      }
    );
  }

  // cargo_build tool - Build Rust project
  if (shouldRegister([ProjectType.RUST])) {
    server.registerTool(
      'cargo_build',
      {
        description: 'Build Rust project with Cargo',
        inputSchema: z.object({
          path: z.string().optional().describe('Project path (default: workspace root)'),
          release: z.boolean().optional().describe('Build in release mode'),
        }),
      },
      async ({ path: projectPath = defaultPath, release = false }) => {
        const validation = validator.validate(projectPath);
        if (!validation.valid) {
          return {
            content: [{ type: 'text' as const, text: validation.error! }],
            isError: true,
          };
        }

        const args = ['build'];
        if (release) args.push('--release');

        return executeCommand('cargo', args, validation.resolvedPath!, commandTimeout);
      }
    );
  }

  // go_build tool - Build Go project
  if (shouldRegister([ProjectType.GO])) {
    server.registerTool(
      'go_build',
      {
        description: 'Build Go project',
        inputSchema: z.object({
          path: z.string().optional().describe('Project path (default: workspace root)'),
          output: z.string().optional().describe('Output binary name'),
        }),
      },
      async ({ path: projectPath = defaultPath, output }) => {
        const validation = validator.validate(projectPath);
        if (!validation.valid) {
          return {
            content: [{ type: 'text' as const, text: validation.error! }],
            isError: true,
          };
        }

        const args = ['build'];
        if (output) args.push('-o', output);

        return executeCommand('go', args, validation.resolvedPath!, commandTimeout);
      }
    );
  }
}

// Helper function to execute commands
function executeCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  return new Promise((resolve) => {
    let resolved = false;
    const proc = spawn(command, args, {
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
      if (resolved) return;
      resolved = true;

      const output = stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '');
      if (code === 0) {
        resolve({
          content: [{ type: 'text' as const, text: output || 'Success (no output)' }],
        });
      } else {
        resolve({
          content: [{ type: 'text' as const, text: `Error (exit code ${code}):\n${output}` }],
          isError: true,
        });
      }
    });

    proc.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      resolve({
        content: [
          {
            type: 'text' as const,
            text: `Error executing ${command}: ${error.message}. Make sure it's installed.`,
          },
        ],
        isError: true,
      });
    });

    proc.on('timeout', () => {
      if (resolved) return;
      resolved = true;
      proc.kill();
      resolve({
        content: [
          {
            type: 'text' as const,
            text: `Command '${command}' timed out after ${timeout}ms`,
          },
        ],
        isError: true,
      });
    });
  });
}
