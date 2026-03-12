import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';
import { ProjectType } from '../detection/project-types.js';

// Store detected project types for use in helper functions
let detectedProjectTypes: ProjectType[] | undefined = undefined;

export function registerFormattingTools(
  server: McpServer,
  validator: PathValidator,
  commandTimeout: number,
  workspace: string,
  projectTypes?: ProjectType[]
) {
  // Store project types for use in helper functions
  detectedProjectTypes = projectTypes;

  // Workspace is now required
  const defaultPath = workspace;

  // Helper to check if a formatter/linter should be available based on project types
  const isAvailable = (types: ProjectType[]): boolean => {
    if (!detectedProjectTypes || detectedProjectTypes.length === 0) {
      return true; // No filtering when no project types specified
    }
    return types.some((t) => detectedProjectTypes!.includes(t));
  };

  // Get available formatters based on project type
  const getAvailableFormatters = (): string[] => {
    const formatters: string[] = [];
    if (
      isAvailable([ProjectType.NODE_JS, ProjectType.REACT, ProjectType.VUE, ProjectType.NEXTJS])
    ) {
      formatters.push('prettier', 'eslint');
    }
    if (isAvailable([ProjectType.PYTHON, ProjectType.DJANGO, ProjectType.FLASK])) {
      formatters.push('black');
    }
    if (isAvailable([ProjectType.LARAVEL, ProjectType.PHP])) {
      formatters.push('pint');
    }
    if (isAvailable([ProjectType.RUST])) {
      formatters.push('rustfmt');
    }
    if (isAvailable([ProjectType.GO])) {
      formatters.push('gofmt');
    }
    return formatters;
  };

  // Get available linters based on project type
  const getAvailableLinters = (): string[] => {
    const linters: string[] = [];
    if (
      isAvailable([ProjectType.NODE_JS, ProjectType.REACT, ProjectType.VUE, ProjectType.NEXTJS])
    ) {
      linters.push('eslint');
    }
    if (isAvailable([ProjectType.PYTHON, ProjectType.DJANGO, ProjectType.FLASK])) {
      linters.push('pylint', 'flake8');
    }
    if (isAvailable([ProjectType.RUST])) {
      linters.push('clippy');
    }
    if (isAvailable([ProjectType.GO])) {
      linters.push('golangci-lint');
    }
    return linters;
  };

  const availableFormatters = getAvailableFormatters();
  const availableLinters = getAvailableLinters();

  // format_code tool - Format code with prettier/eslint
  server.registerTool(
    'format_code',
    {
      description:
        'Format code using available code formatters. By default runs in dry-run mode (preview only). Set write=true to actually modify files. USE THIS to maintain consistent code style.',
      inputSchema: z
        .object({
          path: z
            .string()
            .optional()
            .describe('File or directory path to format (default: workspace root)'),
          formatter: z
            .enum([
              ...(availableFormatters.length > 0 ? availableFormatters : ['prettier']),
              'auto',
            ] as const)
            .optional()
            .describe('Formatter to use (default: auto-detect)'),
          write: z.boolean().optional().describe('Write changes to file (default: false, dry-run)'),
        })
        .refine(
          (val) =>
            !val.formatter ||
            val.formatter === 'auto' ||
            availableFormatters.includes(val.formatter),
          {
            message: `Formatter not available for this project type. Available: ${availableFormatters.join(', ')}`,
          }
        ),
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
        const detectedFormatter =
          formatter === 'auto' || !formatter ? await detectFormatter(absolutePath) : formatter;

        if (!detectedFormatter) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: Could not detect formatter. Available formatters for this project: ${availableFormatters.join(', ')}`,
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
        'Run linter to check code quality and find potential issues. USE THIS before committing to catch errors and maintain code quality.',
      inputSchema: z
        .object({
          path: z
            .string()
            .optional()
            .describe('File or directory path to lint (default: workspace root)'),
          linter: z
            .enum([
              ...(availableLinters.length > 0 ? availableLinters : ['eslint']),
              'auto',
            ] as const)
            .optional()
            .describe('Linter to use (default: auto-detect)'),
        })
        .refine(
          (val) => !val.linter || val.linter === 'auto' || availableLinters.includes(val.linter),
          {
            message: `Linter not available for this project type. Available: ${availableLinters.join(', ')}`,
          }
        ),
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
        const detectedLinter =
          linter === 'auto' || !linter ? await detectLinter(absolutePath) : linter;

        if (!detectedLinter) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: Could not detect linter. Available linters for this project: ${availableLinters.join(', ')}`,
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
      inputSchema: z
        .object({
          path: z
            .string()
            .optional()
            .describe('File or directory path to fix (default: workspace root)'),
          linter: z
            .enum([
              ...(availableFormatters.length > 0 ? availableFormatters : ['eslint']),
              'auto',
            ] as const)
            .optional()
            .describe('Linter to use (default: auto-detect)'),
        })
        .refine(
          (val) => !val.linter || val.linter === 'auto' || availableFormatters.includes(val.linter),
          {
            message: `Linter not available for this project type. Available: ${availableFormatters.join(', ')}`,
          }
        ),
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
        const detectedLinter =
          linter === 'auto' || !linter ? await detectLinter(absolutePath) : linter;

        if (!detectedLinter) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: Could not detect linter. Available linters for this project: ${availableLinters.join(', ')}`,
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

  // check_syntax tool - Validate syntax (always available, works with any file)
  server.registerTool(
    'check_syntax',
    {
      description: 'Check code syntax without executing',
      inputSchema: z.object({
        path: z.string().describe('File path to check'),
        language: z
          .enum(['javascript', 'typescript', 'python', 'php', 'ruby', 'go', 'rust'] as const)
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

// Helper: Detect formatter based on file extension and project type
async function detectFormatter(filePath: string): Promise<string | null> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  // Helper to check if a formatter is available for detected project types
  const isAvailable = (types: ProjectType[]): boolean => {
    if (!detectedProjectTypes || detectedProjectTypes.length === 0) {
      return true;
    }
    return types.some((t) => detectedProjectTypes!.includes(t));
  };

  if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx' || ext === 'json') {
    return isAvailable([
      ProjectType.NODE_JS,
      ProjectType.REACT,
      ProjectType.VUE,
      ProjectType.NEXTJS,
    ])
      ? 'prettier'
      : null;
  } else if (ext === 'py') {
    return isAvailable([ProjectType.PYTHON, ProjectType.DJANGO, ProjectType.FLASK])
      ? 'black'
      : null;
  } else if (ext === 'php') {
    return isAvailable([ProjectType.LARAVEL, ProjectType.PHP]) ? 'pint' : null;
  } else if (ext === 'rs') {
    return isAvailable([ProjectType.RUST]) ? 'rustfmt' : null;
  } else if (ext === 'go') {
    return isAvailable([ProjectType.GO]) ? 'gofmt' : null;
  }

  return null;
}

// Helper: Detect linter based on file extension and project type
async function detectLinter(filePath: string): Promise<string | null> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  // Helper to check if a linter is available for detected project types
  const isAvailable = (types: ProjectType[]): boolean => {
    if (!detectedProjectTypes || detectedProjectTypes.length === 0) {
      return true;
    }
    return types.some((t) => detectedProjectTypes!.includes(t));
  };

  if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') {
    return isAvailable([
      ProjectType.NODE_JS,
      ProjectType.REACT,
      ProjectType.VUE,
      ProjectType.NEXTJS,
    ])
      ? 'eslint'
      : null;
  } else if (ext === 'py') {
    return isAvailable([ProjectType.PYTHON, ProjectType.DJANGO, ProjectType.FLASK])
      ? 'flake8'
      : null;
  } else if (ext === 'rs') {
    return isAvailable([ProjectType.RUST]) ? 'clippy' : null;
  } else if (ext === 'go') {
    return isAvailable([ProjectType.GO]) ? 'golangci-lint' : null;
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
