import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs/promises';
import path from 'path';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';

// Common directories to exclude from project structure (build artifacts, dependencies, cache)
const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  'target',
  'bin',
  'obj',
  '.venv',
  'venv',
  '.virtualenv',
  'vendor',
  'tmp',
  'temp',
  '.cache',
  '.turbo',
  '.tsbuildinfo',
]);

export function registerProjectTools(server: McpServer, validator: PathValidator) {
  // get_project_structure tool - Get file tree with .gitignore support
  server.registerTool(
    'get_project_structure',
    {
      description:
        'Get the complete file tree structure of a project. Automatically excludes common build/dependency directories (node_modules, dist, build, etc.) and hidden files. BEST way to quickly understand project layout without manually browsing directories.',
      inputSchema: z.object({
        path: z.string().describe('Project root path'),
        maxDepth: z.number().optional().describe('Maximum depth to traverse (default: 5)'),
        includeHidden: z.boolean().optional().describe('Include hidden files/folders'),
        excludePatterns: z
          .array(z.string())
          .optional()
          .describe('Additional directory/file patterns to exclude (e.g., ["dist", "build"])'),
      }),
    },
    async ({ path: projectPath, maxDepth = 5, includeHidden = false, excludePatterns = [] }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        // Merge default excludes with user-provided patterns
        const excludeDirs = new Set([...DEFAULT_EXCLUDE_DIRS, ...excludePatterns]);
        const structure = await buildFileTree(
          projectPath,
          maxDepth,
          includeHidden,
          0,
          '',
          excludeDirs
        );
        return {
          content: [{ type: 'text' as const, text: structure }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error getting project structure: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // analyze_project tool - Detect language, framework, dependencies
  server.registerTool(
    'analyze_project',
    {
      description:
        'Automatically detect project language, framework, and dependencies by analyzing configuration files (package.json, requirements.txt, Cargo.toml, etc.). USE THIS to quickly understand what tech stack a project uses before making changes.',
      inputSchema: z.object({
        path: z.string().describe('Project root path'),
      }),
    },
    async ({ path: projectPath }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const analysis = await analyzeProject(projectPath);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(analysis, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error analyzing project: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // find_files tool - Find files by pattern
  server.registerTool(
    'find_files',
    {
      description:
        'Find files matching a glob pattern (e.g., "*.ts", "**/*.json", "src/**/*.test.ts"). MORE EFFICIENT than manually searching. Use this to locate specific files by pattern when you know the naming convention.',
      inputSchema: z.object({
        path: z.string().describe('Directory to search in'),
        pattern: z.string().describe('File pattern (e.g., "*.ts", "**/*.json")'),
        maxResults: z.number().optional().describe('Maximum number of results (default: 100)'),
      }),
    },
    async ({ path: searchPath, pattern, maxResults = 100 }) => {
      const validation = validator.validate(searchPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const files = await findFiles(searchPath, pattern, maxResults);
        const result = files.length > 0 ? files.join('\n') : 'No files found';
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error finding files: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // get_file_info tool - Get file metadata
  server.registerTool(
    'get_file_info',
    {
      description:
        "Get detailed metadata about a file including size, modified/created timestamps, file type, and permissions. USE THIS to check file details before editing to understand what you're working with.",
      inputSchema: z.object({
        path: z.string().describe('File path'),
      }),
    },
    async ({ path: filePath }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const stats = await fs.stat(filePath);
        const info = {
          path: filePath,
          size: stats.size,
          sizeHuman: formatBytes(stats.size),
          type: stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : 'other',
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
          permissions: stats.mode.toString(8).slice(-3),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error getting file info: ${error}` }],
          isError: true,
        };
      }
    }
  );
}

// Helper: Build file tree recursively
async function buildFileTree(
  dirPath: string,
  maxDepth: number,
  includeHidden: boolean,
  currentDepth: number,
  prefix: string,
  excludeDirs: Set<string>
): Promise<string> {
  if (currentDepth >= maxDepth) {
    return '';
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let result = '';

    // Filter out hidden files and excluded directories
    const filteredEntries = entries.filter((entry) => {
      // Skip excluded directories
      if (excludeDirs.has(entry.name)) {
        return false;
      }
      // Filter hidden files if needed
      if (!includeHidden && entry.name.startsWith('.')) {
        return false;
      }
      return true;
    });

    for (let i = 0; i < filteredEntries.length; i++) {
      const entry = filteredEntries[i];
      const isLast = i === filteredEntries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const newPrefix = prefix + (isLast ? '    ' : '│   ');

      result += `${prefix}${connector}${entry.name}\n`;

      if (entry.isDirectory()) {
        const subPath = path.join(dirPath, entry.name);
        result += await buildFileTree(
          subPath,
          maxDepth,
          includeHidden,
          currentDepth + 1,
          newPrefix,
          excludeDirs
        );
      }
    }

    return result;
  } catch (error) {
    return `${prefix}[Error reading directory: ${error}]\n`;
  }
}

// Helper: Analyze project
async function analyzeProject(projectPath: string): Promise<Record<string, unknown>> {
  const analysis: Record<string, unknown> = {
    path: projectPath,
    language: 'unknown',
    framework: 'unknown',
    packageManager: 'unknown',
    dependencies: {},
  };

  try {
    const files = await fs.readdir(projectPath);

    // Detect Node.js/JavaScript/TypeScript
    if (files.includes('package.json')) {
      analysis.language = 'JavaScript/TypeScript';
      analysis.packageManager = files.includes('package-lock.json')
        ? 'npm'
        : files.includes('yarn.lock')
          ? 'yarn'
          : files.includes('pnpm-lock.yaml')
            ? 'pnpm'
            : 'npm';

      try {
        const packageJson = JSON.parse(
          await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8')
        );
        analysis.dependencies = packageJson.dependencies || {};

        // Detect framework
        if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
          analysis.framework = 'React';
        } else if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
          analysis.framework = 'Vue';
        } else if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
          analysis.framework = 'Next.js';
        } else if (packageJson.dependencies?.express) {
          analysis.framework = 'Express';
        } else if (packageJson.dependencies?.['@nestjs/core']) {
          analysis.framework = 'NestJS';
        }
      } catch {
        // Ignore package.json parse errors
      }
    }

    // Detect Python
    if (
      files.includes('requirements.txt') ||
      files.includes('setup.py') ||
      files.includes('pyproject.toml')
    ) {
      analysis.language = 'Python';
      if (files.includes('manage.py')) {
        analysis.framework = 'Django';
      } else if (files.includes('app.py') || files.includes('wsgi.py')) {
        analysis.framework = 'Flask';
      }
    }

    // Detect PHP
    if (files.includes('composer.json')) {
      analysis.language = 'PHP';
      if (files.includes('artisan')) {
        analysis.framework = 'Laravel';
      }
    }

    // Detect Ruby
    if (files.includes('Gemfile')) {
      analysis.language = 'Ruby';
      if (files.includes('config.ru')) {
        analysis.framework = 'Rails';
      }
    }

    // Detect Go
    if (files.includes('go.mod')) {
      analysis.language = 'Go';
    }

    // Detect Rust
    if (files.includes('Cargo.toml')) {
      analysis.language = 'Rust';
    }

    // Detect Java
    if (files.includes('pom.xml')) {
      analysis.language = 'Java';
      analysis.framework = 'Maven';
    } else if (files.includes('build.gradle')) {
      analysis.language = 'Java/Kotlin';
      analysis.framework = 'Gradle';
    }

    return analysis;
  } catch {
    return { error: 'Failed to analyze project' };
  }
}

// Helper: Find files matching pattern
async function findFiles(
  dirPath: string,
  pattern: string,
  maxResults: number,
  results: string[] = []
): Promise<string[]> {
  if (results.length >= maxResults) {
    return results;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) {
        break;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, .git, etc.
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await findFiles(fullPath, pattern, maxResults, results);
        }
      } else if (entry.isFile()) {
        // Simple pattern matching (supports * wildcard)
        if (matchPattern(entry.name, pattern)) {
          results.push(fullPath);
        }
      }
    }

    return results;
  } catch {
    return results;
  }
}

// Helper: Simple pattern matching
function matchPattern(filename: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

// Helper: Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
