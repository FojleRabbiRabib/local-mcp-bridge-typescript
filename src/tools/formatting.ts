import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';

export function registerFormattingTools(
  server: McpServer,
  validator: PathValidator,
  commandTimeout: number,
  workspace: string
) {
  // Workspace is now required
  const defaultPath = workspace;

  // format_code tool - Format code with prettier/eslint
  server.registerTool(
    'format_code',
    {
      description:
        'Format code using prettier, eslint, black, pint, rustfmt, or gofmt. By default runs in dry-run mode (preview only). Set write=true to actually modify files. USE THIS to maintain consistent code style.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('File or directory path to format (default: workspace root)'),
        formatter: z
          .enum(['prettier', 'eslint', 'black', 'pint', 'rustfmt', 'gofmt'])
          .optional()
          .describe('Formatter to use (default: auto-detect)'),
        write: z.boolean().optional().describe('Write changes to file (default: false, dry-run)'),
      }),
    },
    async ({ path: filePath = defaultPath, formatter, write = false }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      try {
        // Auto-detect formatter if not specified
        const detectedFormatter = formatter || (await detectFormatter(absolutePath));

        if (!detectedFormatter) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Could not detect formatter. Please specify one.',
              },
            ],
            isError: true,
          };
        }

        const result = await runFormatter(detectedFormatter, absolutePath, write, commandTimeout);
        return result;
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error formatting code: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // lint_code tool - Run linter
  server.registerTool(
    'lint_code',
    {
      description:
        'Run linter (eslint, pylint, flake8, clippy, golangci-lint) to check code quality and find potential issues. USE THIS before committing to catch errors and maintain code quality.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('File or directory path to lint (default: workspace root)'),
        linter: z
          .enum(['eslint', 'pylint', 'flake8', 'clippy', 'golangci-lint'])
          .optional()
          .describe('Linter to use (default: auto-detect)'),
      }),
    },
    async ({ path: filePath = defaultPath, linter }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      try {
        // Auto-detect linter if not specified
        const detectedLinter = linter || (await detectLinter(absolutePath));

        if (!detectedLinter) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Could not detect linter. Please specify one.',
              },
            ],
            isError: true,
          };
        }

        const result = await runLinter(detectedLinter, absolutePath, commandTimeout);
        return result;
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error linting code: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // fix_lint_issues tool - Auto-fix linting issues
  server.registerTool(
    'fix_lint_issues',
    {
      description: 'Automatically fix linting issues',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('File or directory path to fix (default: workspace root)'),
        linter: z
          .enum(['eslint', 'black', 'rustfmt', 'gofmt'])
          .optional()
          .describe('Linter to use (default: auto-detect)'),
      }),
    },
    async ({ path: filePath = defaultPath, linter }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      try {
        // Auto-detect linter if not specified
        const detectedLinter = linter || (await detectLinter(absolutePath));

        if (!detectedLinter) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Could not detect linter. Please specify one.',
              },
            ],
            isError: true,
          };
        }

        const result = await fixLintIssues(detectedLinter, absolutePath, commandTimeout);
        return result;
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error fixing lint issues: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // check_syntax tool - Validate syntax
  server.registerTool(
    'check_syntax',
    {
      description: 'Check code syntax without executing',
      inputSchema: z.object({
        path: z.string().describe('File path to check'),
        language: z
          .enum(['javascript', 'typescript', 'python', 'php', 'ruby', 'go', 'rust'])
          .optional()
          .describe('Language (default: auto-detect from extension)'),
        pythonVersion: z
          .string()
          .optional()
          .describe(
            'Python version (e.g., "3.8", "3.10"). Uses system default if not specified. Only applies to Python files. Prefered version 3.8.'
          ),
      }),
    },
    async ({ path: filePath, language, pythonVersion }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      try {
        const detectedLanguage = language || detectLanguage(absolutePath);

        if (!detectedLanguage) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: Could not detect language. Please specify one.',
              },
            ],
            isError: true,
          };
        }

        const result = await checkSyntax(
          detectedLanguage,
          absolutePath,
          commandTimeout,
          pythonVersion
        );
        return result;
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error checking syntax: ${error}` }],
          isError: true,
        };
      }
    }
  );
}

// Helper: Detect formatter based on file extension and project
async function detectFormatter(filePath: string): Promise<string | null> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx' || ext === 'json') {
    return 'prettier';
  } else if (ext === 'py') {
    return 'black';
  } else if (ext === 'php') {
    return 'pint';
  } else if (ext === 'rs') {
    return 'rustfmt';
  } else if (ext === 'go') {
    return 'gofmt';
  }

  return null;
}

// Helper: Detect linter based on file extension and project
async function detectLinter(filePath: string): Promise<string | null> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') {
    return 'eslint';
  } else if (ext === 'py') {
    return 'flake8';
  } else if (ext === 'rs') {
    return 'clippy';
  } else if (ext === 'go') {
    return 'golangci-lint';
  }

  return null;
}

// Helper: Detect language from file extension
function detectLanguage(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
  };

  return languageMap[ext || ''] || null;
}

// Helper: Run formatter
async function runFormatter(
  formatter: string,
  filePath: string,
  write: boolean,
  timeout: number
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const commands: Record<string, string[]> = {
    prettier: write ? ['prettier', '--write', filePath] : ['prettier', '--check', filePath],
    eslint: write ? ['eslint', '--fix', filePath] : ['eslint', filePath],
    black: write ? ['black', filePath] : ['black', '--check', filePath],
    pint: write ? ['./vendor/bin/pint', filePath] : ['./vendor/bin/pint', '--test', filePath],
    rustfmt: ['rustfmt', write ? filePath : '--check', filePath],
    gofmt: write ? ['gofmt', '-w', filePath] : ['gofmt', '-d', filePath],
  };

  const args = commands[formatter];
  if (!args) {
    return {
      content: [{ type: 'text' as const, text: `Unknown formatter: ${formatter}` }],
      isError: true,
    };
  }

  return executeCommand(args[0], args.slice(1), timeout);
}

// Helper: Run linter
async function runLinter(
  linter: string,
  filePath: string,
  timeout: number
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const commands: Record<string, string[]> = {
    eslint: ['eslint', filePath],
    pylint: ['pylint', filePath],
    flake8: ['flake8', filePath],
    clippy: ['cargo', 'clippy', '--', '-D', 'warnings'],
    'golangci-lint': ['golangci-lint', 'run', filePath],
  };

  const args = commands[linter];
  if (!args) {
    return {
      content: [{ type: 'text' as const, text: `Unknown linter: ${linter}` }],
      isError: true,
    };
  }

  return executeCommand(args[0], args.slice(1), timeout);
}

// Helper: Fix lint issues
async function fixLintIssues(
  linter: string,
  filePath: string,
  timeout: number
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const commands: Record<string, string[]> = {
    eslint: ['eslint', '--fix', filePath],
    black: ['black', filePath],
    pint: ['./vendor/bin/pint', filePath],
    rustfmt: ['rustfmt', filePath],
    gofmt: ['gofmt', '-w', filePath],
  };

  const args = commands[linter];
  if (!args) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Linter ${linter} does not support auto-fix or is unknown`,
        },
      ],
      isError: true,
    };
  }

  return executeCommand(args[0], args.slice(1), timeout);
}

// Helper: Check syntax
async function checkSyntax(
  language: string,
  filePath: string,
  timeout: number,
  pythonVersion?: string
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3.8';
  const commands: Record<string, string[]> = {
    javascript: ['node', '--check', filePath],
    typescript: ['tsc', '--noEmit', filePath],
    python: [pythonCmd, '-m', 'py_compile', filePath],
    php: ['php', '-l', filePath],
    ruby: ['ruby', '-c', filePath],
    go: ['go', 'build', '-o', '/dev/null', filePath],
    rust: ['rustc', '--crate-type', 'lib', '--emit=metadata', filePath],
  };

  const args = commands[language];
  if (!args) {
    return {
      content: [{ type: 'text' as const, text: `Syntax check not supported for: ${language}` }],
      isError: true,
    };
  }

  return executeCommand(args[0], args.slice(1), timeout);
}

// Helper: Execute command
function executeCommand(
  command: string,
  args: string[],
  timeout: number
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  return new Promise((resolve) => {
    let resolved = false;
    const proc = spawn(command, args, { timeout });

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

      const output = stdout + (stderr ? `\n${stderr}` : '');
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
