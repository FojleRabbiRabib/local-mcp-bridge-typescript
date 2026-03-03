import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';
import fs from 'fs/promises';

export function registerAndroidTools(
  server: McpServer,
  pathValidator: PathValidator,
  commandTimeout: number,
  workspace: string
) {
  const defaultCwd = workspace;

  // Helper function to execute gradlew command
  function executeGradlew(
    args: string[],
    cwd: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null; error?: string }> {
    return new Promise((resolve) => {
      let resolved = false;
      const proc = spawn('./gradlew', args, {
        cwd,
        timeout,
        shell: true, // Required to execute gradlew as a script
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
        resolve({ stdout, stderr, exitCode: code });
      });

      proc.on('error', (error) => {
        if (resolved) return;
        resolved = true;
        resolve({ stdout, stderr, exitCode: -1, error: error.message });
      });

      proc.on('timeout', () => {
        if (resolved) return;
        resolved = true;
        proc.kill();
        resolve({ stdout, stderr, exitCode: -1, error: `Command timed out after ${timeout}ms` });
      });
    });
  }

  // Helper to check if directory is an Android project
  async function isAndroidProject(projectPath: string): Promise<boolean> {
    const validation = pathValidator.validate(projectPath);
    if (!validation.valid) {
      return false;
    }

    const resolvedPath = validation.resolvedPath!;
    const files: string[] = await fs.readdir(resolvedPath).catch(() => []);

    // Check for Android project indicators
    const hasGradlew = files.includes('gradlew') || files.includes('gradlew.bat');
    const hasBuildGradle =
      files.includes('build.gradle') ||
      files.includes('build.gradle.kts') ||
      files.includes('settings.gradle') ||
      files.includes('settings.gradle.kts');

    return hasGradlew && hasBuildGradle;
  }

  // Helper to format gradle output
  function formatGradleOutput(
    stdout: string,
    stderr: string,
    exitCode: number | null,
    error?: string
  ): string {
    let output = '';
    if (error) {
      output += `Error: ${error}\n\n`;
    }
    output += `Exit Code: ${exitCode}\n\n`;
    if (stdout) {
      output += `Output:\n${stdout}\n\n`;
    }
    if (stderr) {
      output += `Errors:\n${stderr}\n`;
    }
    return output || 'No output';
  }

  // android_build - Build all modules in the project
  server.registerTool(
    'android_build',
    {
      description:
        'Build all modules in an Android project using Gradle. Compiles all variants and generates APK/AAB files.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
      }),
    },
    async ({ path: projectPath = defaultCwd }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const result = await executeGradlew(['build'], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_assemble - Build specific variant
  server.registerTool(
    'android_assemble',
    {
      description:
        'Build a specific Android build variant (Debug/Release). Generates an APK file for the specified variant.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
        variant: z
          .string()
          .optional()
          .default('Debug')
          .describe('Build variant: Debug, Release, or custom (default: Debug)'),
        flavor: z
          .string()
          .optional()
          .describe('Build flavor (e.g., "free", "paid") if using product flavors'),
      }),
    },
    async ({ path: projectPath = defaultCwd, variant = 'Debug', flavor }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      // Build task name: assembleFlavorVariant or assembleVariant
      let taskName: string;
      if (flavor) {
        taskName = `assemble${flavor.charAt(0).toUpperCase() + flavor.slice(1)}${variant}`;
      } else {
        taskName = `assemble${variant}`;
      }

      const result = await executeGradlew([taskName], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_clean - Clean build artifacts
  server.registerTool(
    'android_clean',
    {
      description:
        'Clean all build artifacts and intermediates. Removes generated files from the build directory.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
      }),
    },
    async ({ path: projectPath = defaultCwd }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const result = await executeGradlew(['clean'], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_test - Run unit tests
  server.registerTool(
    'android_test',
    {
      description:
        'Run unit tests for the Android project. Executes local JVM tests without requiring a connected device.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
        module: z.string().optional().describe('Specific module to test (e.g., "app")'),
      }),
    },
    async ({ path: projectPath = defaultCwd, module }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const taskName = module ? `${module}:test` : 'test';
      const result = await executeGradlew([taskName], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_connected_test - Run instrumented tests
  server.registerTool(
    'android_connected_test',
    {
      description:
        'Run instrumented Android tests on a connected device or emulator. Requires a connected Android device or running emulator.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
        module: z.string().optional().describe('Specific module to test (e.g., "app")'),
      }),
    },
    async ({ path: projectPath = defaultCwd, module }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const taskName = module ? `${module}:connectedAndroidTest` : 'connectedAndroidTest';
      const result = await executeGradlew([taskName], absolutePath, commandTimeout * 3); // Tests take longer
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_lint - Run Android Lint
  server.registerTool(
    'android_lint',
    {
      description:
        'Run Android Lint checks to detect code quality issues, potential bugs, and improvement opportunities. Generates a lint report.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
      }),
    },
    async ({ path: projectPath = defaultCwd }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const result = await executeGradlew(['lint'], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_install - Install APK on connected device
  server.registerTool(
    'android_install',
    {
      description:
        'Install the app APK on a connected Android device or emulator. Requires a connected device via USB or running emulator.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
        variant: z
          .string()
          .optional()
          .default('Debug')
          .describe('Build variant to install: Debug, Release, or custom (default: Debug)'),
        flavor: z
          .string()
          .optional()
          .describe('Build flavor (e.g., "free", "paid") if using product flavors'),
      }),
    },
    async ({ path: projectPath = defaultCwd, variant = 'Debug', flavor }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      let taskName: string;
      if (flavor) {
        taskName = `install${flavor.charAt(0).toUpperCase() + flavor.slice(1)}${variant}`;
      } else {
        taskName = `install${variant}`;
      }

      const result = await executeGradlew([taskName], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_uninstall - Uninstall app from connected device
  server.registerTool(
    'android_uninstall',
    {
      description: 'Uninstall the app from all connected Android devices and emulators.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
      }),
    },
    async ({ path: projectPath = defaultCwd }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const result = await executeGradlew(['uninstallAll'], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_bundle - Create AAB bundle for Play Store
  server.registerTool(
    'android_bundle',
    {
      description:
        'Create an Android App Bundle (.aab) for publishing to Google Play Store. Bundles are optimized for delivery and can generate multiple APKs.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
        variant: z
          .string()
          .optional()
          .default('Release')
          .describe('Build variant for bundle: Debug, Release, or custom (default: Release)'),
        flavor: z
          .string()
          .optional()
          .describe('Build flavor (e.g., "free", "paid") if using product flavors'),
      }),
    },
    async ({ path: projectPath = defaultCwd, variant = 'Release', flavor }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      let taskName: string;
      if (flavor) {
        taskName = `bundle${flavor.charAt(0).toUpperCase() + flavor.slice(1)}${variant}`;
      } else {
        taskName = `bundle${variant}`;
      }

      const result = await executeGradlew([taskName], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_dependencies - Show dependency tree
  server.registerTool(
    'android_dependencies',
    {
      description:
        'Display the complete dependency tree for the Android project. Shows all direct and transitive dependencies with versions.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
        configuration: z
          .string()
          .optional()
          .describe(
            'Specific configuration to analyze (e.g., "debugRuntimeClasspath", "releaseRuntimeClasspath")'
          ),
      }),
    },
    async ({ path: projectPath = defaultCwd, configuration }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const args = configuration
        ? ['dependencies', '--configuration', configuration]
        : ['dependencies'];
      const result = await executeGradlew(args, absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_tasks - List available gradle tasks
  server.registerTool(
    'android_tasks',
    {
      description:
        'List all available Gradle tasks for the Android project. Shows task names, descriptions, and groupings. Use this to discover what operations are available.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
        group: z
          .string()
          .optional()
          .describe('Filter tasks by group (e.g., "build", "help", "verification")'),
      }),
    },
    async ({ path: projectPath = defaultCwd, group }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const args = group ? ['tasks', '--group', group] : ['tasks'];
      const result = await executeGradlew(args, absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );

  // android_projects - List subprojects
  server.registerTool(
    'android_projects',
    {
      description:
        'List all Gradle subprojects in the Android project. Useful for understanding multi-module project structure.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Path to the Android project (default: workspace root)'),
      }),
    },
    async ({ path: projectPath = defaultCwd }) => {
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const hasProject = await isAndroidProject(absolutePath);
      if (!hasProject) {
        return {
          content: [
            {
              type: 'text',
              text: 'Not an Android project. No gradlew or build.gradle files found.',
            },
          ],
          isError: true,
        };
      }

      const result = await executeGradlew(['projects'], absolutePath, commandTimeout);
      return {
        content: [
          {
            type: 'text',
            text: formatGradleOutput(result.stdout, result.stderr, result.exitCode, result.error),
          },
        ],
      };
    }
  );
}
