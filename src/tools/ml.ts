import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';
import { ProjectType } from '../detection/project-types.js';

export function registerMLTools(
  server: McpServer,
  validator: PathValidator,
  commandTimeout: number,
  workspace: string,
  projectTypes?: ProjectType[]
) {
  // Workspace is now required
  const defaultPath = workspace;

  // Helper to check if ML tools should be registered based on project types
  const shouldRegister = (): boolean => {
    if (!projectTypes || projectTypes.length === 0) {
      return true; // No filtering when no project types specified (backward compatibility)
    }
    // Only register for Python projects
    return projectTypes.some(
      (t) => t === ProjectType.PYTHON || t === ProjectType.DJANGO || t === ProjectType.FLASK
    );
  };

  // If not a Python project, don't register any ML tools
  if (!shouldRegister()) {
    return;
  }

  // jupyter_run tool - Run Jupyter notebook cell or file
  server.registerTool(
    'jupyter_run',
    {
      description:
        'Execute a Jupyter notebook and save the output. USE THIS to run notebooks non-interactively for testing or automation.',
      inputSchema: z.object({
        path: z.string().describe('Path to .ipynb file'),
        output: z.string().optional().describe('Output notebook path'),
      }),
    },
    async ({ path: notebookPath, output }) => {
      const validation = validator.validate(notebookPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const args = ['nbconvert', '--execute', '--to', 'notebook', absolutePath];
      if (output) {
        args.push('--output', output);
      }

      return executeCommand('jupyter', args, path.dirname(absolutePath), commandTimeout);
    }
  );

  // python_venv_create tool - Create Python virtual environment
  server.registerTool(
    'python_venv_create',
    {
      description:
        'Create an isolated Python virtual environment. ALWAYS use this before installing Python packages to avoid polluting the system Python.',
      inputSchema: z.object({
        path: z.string().optional().describe('Project path (default: workspace root)'),
        name: z.string().optional().describe('Virtual environment name (default: venv)'),
        pythonVersion: z
          .string()
          .optional()
          .describe(
            'Python version (e.g., "3.8", "3.10"). Uses system default if not specified. Prefered version 3.8.'
          ),
      }),
    },
    async ({ path: projectPath = defaultPath, name = 'venv', pythonVersion }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3.8';
      return executeCommand(pythonCmd, ['-m', 'venv', name], absolutePath, commandTimeout);
    }
  );

  // conda_env_create tool - Create Conda environment
  server.registerTool(
    'conda_env_create',
    {
      description:
        'Create a new Conda environment with specific Python version and packages. USE THIS for managing Python environments when Conda is available.',
      inputSchema: z.object({
        name: z.string().describe('Environment name'),
        python: z.string().optional().describe('Python version (e.g., "3.10")'),
        packages: z.array(z.string()).optional().describe('Packages to install'),
      }),
    },
    async ({ name, python, packages = [] }) => {
      const args = ['create', '-n', name, '-y'];
      if (python) {
        args.push(`python=${python}`);
      }
      if (packages.length > 0) {
        args.push(...packages);
      }

      return executeCommand('conda', args, defaultPath, commandTimeout);
    }
  );

  // conda_env_list tool - List Conda environments
  server.registerTool(
    'conda_env_list',
    {
      description:
        'List all available Conda environments. USE THIS to see what environments exist before activating or creating one.',
      inputSchema: z.object({}),
    },
    async () => {
      return executeCommand('conda', ['env', 'list'], defaultPath, commandTimeout);
    }
  );

  // pip_freeze tool - List installed Python packages
  server.registerTool(
    'pip_freeze',
    {
      description: 'List installed Python packages (pip freeze)',
      inputSchema: z.object({
        path: z.string().optional().describe('Project path (default: workspace root)'),
        output: z.string().optional().describe('Save to file (e.g., requirements.txt)'),
        pythonVersion: z
          .string()
          .optional()
          .describe(
            'Python version (e.g., "3.8", "3.10"). Uses system default if not specified. Prefered version 3.8.'
          ),
      }),
    },
    async ({ path: projectPath = defaultPath, output, pythonVersion }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3.8';
      const pipArgs = [pythonCmd, '-m', 'pip', 'freeze'];

      if (output) {
        // Save to file
        return new Promise((resolve) => {
          let resolved = false;
          const proc = spawn(pipArgs[0], pipArgs.slice(1), {
            cwd: absolutePath,
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

          proc.on('close', async (code) => {
            if (resolved) return;
            resolved = true;

            if (code === 0) {
              try {
                const outputPath = path.join(absolutePath, output);
                await fs.writeFile(outputPath, stdout, 'utf-8');
                resolve({
                  content: [{ type: 'text' as const, text: `Saved to ${output}` }],
                });
              } catch (error) {
                resolve({
                  content: [{ type: 'text' as const, text: `Error saving file: ${error}` }],
                  isError: true,
                });
              }
            } else {
              resolve({
                content: [
                  {
                    type: 'text' as const,
                    text: `Error: exit code ${code}${stderr ? `\n${stderr}` : ''}`,
                  },
                ],
                isError: true,
              });
            }
          });

          proc.on('error', (error) => {
            if (resolved) return;
            resolved = true;
            resolve({
              content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
              isError: true,
            });
          });

          proc.on('timeout', () => {
            if (resolved) return;
            resolved = true;
            proc.kill();
            resolve({
              content: [
                { type: 'text' as const, text: `pip freeze timed out after ${commandTimeout}ms` },
              ],
              isError: true,
            });
          });
        });
      } else {
        return executeCommand(pipArgs[0], pipArgs.slice(1), absolutePath, commandTimeout);
      }
    }
  );

  // tensorboard_start tool - Start TensorBoard
  server.registerTool(
    'tensorboard_start',
    {
      description: 'Start TensorBoard server',
      inputSchema: z.object({
        logdir: z.string().describe('Log directory path'),
        port: z.number().optional().describe('Port number (default: 6006)'),
      }),
    },
    async ({ logdir, port = 6006 }) => {
      const validation = validator.validate(logdir);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;
      return {
        content: [
          {
            type: 'text' as const,
            text: `To start TensorBoard, run:\ntensorboard --logdir=${absolutePath} --port=${port}\n\nNote: This tool cannot start background processes. Please run manually.`,
          },
        ],
      };
    }
  );

  // check_gpu tool - Check GPU availability
  server.registerTool(
    'check_gpu',
    {
      description: 'Check GPU availability (CUDA/ROCm)',
      inputSchema: z.object({
        framework: z
          .enum(['pytorch', 'tensorflow', 'cuda'])
          .optional()
          .describe('Framework to check'),
        pythonVersion: z
          .string()
          .optional()
          .describe(
            'Python version (e.g., "3.8", "3.10"). Uses system default if not specified. Only applies to pytorch/tensorflow checks. Prefered version 3.8.'
          ),
      }),
    },
    async ({ framework = 'cuda', pythonVersion }) => {
      if (framework === 'cuda') {
        return executeCommand('nvidia-smi', [], defaultPath, commandTimeout);
      } else if (framework === 'pytorch') {
        const pythonCode =
          'import torch; print(f"CUDA available: {torch.cuda.is_available()}"); print(f"Device count: {torch.cuda.device_count()}"); print(f"Current device: {torch.cuda.current_device() if torch.cuda.is_available() else \'N/A\'}")';
        const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3.8';
        return executeCommand(pythonCmd, ['-c', pythonCode], defaultPath, commandTimeout);
      } else if (framework === 'tensorflow') {
        const pythonCode =
          'import tensorflow as tf; print(f"GPU devices: {tf.config.list_physical_devices(\'GPU\')}")';
        const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3.8';
        return executeCommand(pythonCmd, ['-c', pythonCode], defaultPath, commandTimeout);
      }

      return {
        content: [{ type: 'text' as const, text: 'Unknown framework' }],
        isError: true,
      };
    }
  );

  // dataset_info tool - Get dataset information
  server.registerTool(
    'dataset_info',
    {
      description: 'Get information about a dataset file (CSV, JSON, etc.)',
      inputSchema: z.object({
        path: z.string().describe('Dataset file path'),
      }),
    },
    async ({ path: datasetPath }) => {
      const validation = validator.validate(datasetPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const absolutePath = validation.resolvedPath!;
        const ext = path.extname(absolutePath).toLowerCase();
        const stats = await fs.stat(absolutePath);

        let info = `Dataset: ${path.basename(absolutePath)}\n`;
        info += `Size: ${formatBytes(stats.size)}\n`;
        info += `Modified: ${stats.mtime.toISOString()}\n\n`;

        if (ext === '.csv') {
          // Use Python pandas to get CSV info
          const pythonCode = `
import pandas as pd
df = pd.read_csv('${absolutePath}')
print(f"Rows: {len(df)}")
print(f"Columns: {len(df.columns)}")
print(f"\\nColumn names:\\n{', '.join(df.columns)}")
print(f"\\nData types:\\n{df.dtypes}")
print(f"\\nMemory usage: {df.memory_usage(deep=True).sum() / 1024**2:.2f} MB")
`;
          return executeCommand('python', ['-c', pythonCode], defaultPath, commandTimeout);
        } else if (ext === '.json') {
          // Read JSON and show structure
          const content = await fs.readFile(absolutePath, 'utf-8');
          const data = JSON.parse(content);
          info += `Type: ${Array.isArray(data) ? 'Array' : 'Object'}\n`;
          if (Array.isArray(data)) {
            info += `Length: ${data.length}\n`;
            if (data.length > 0) {
              info += `Sample keys: ${Object.keys(data[0]).join(', ')}\n`;
            }
          } else {
            info += `Keys: ${Object.keys(data).join(', ')}\n`;
          }
          return {
            content: [{ type: 'text' as const, text: info }],
          };
        } else {
          return {
            content: [
              { type: 'text' as const, text: info + 'Format not supported for detailed analysis' },
            ],
          };
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error analyzing dataset: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // model_info tool - Get model file information
  server.registerTool(
    'model_info',
    {
      description: 'Get information about a model file (.h5, .pt, .pkl, etc.)',
      inputSchema: z.object({
        path: z.string().describe('Model file path'),
      }),
    },
    async ({ path: modelPath }) => {
      const validation = validator.validate(modelPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const absolutePath = validation.resolvedPath!;
        const ext = path.extname(absolutePath).toLowerCase();
        const stats = await fs.stat(absolutePath);

        let info = `Model: ${path.basename(absolutePath)}\n`;
        info += `Size: ${formatBytes(stats.size)}\n`;
        info += `Modified: ${stats.mtime.toISOString()}\n`;

        if (ext === '.pt' || ext === '.pth') {
          info += `Type: PyTorch model\n`;
        } else if (ext === '.h5' || ext === '.keras') {
          info += `Type: Keras/TensorFlow model\n`;
        } else if (ext === '.pkl' || ext === '.pickle') {
          info += `Type: Pickle file\n`;
        } else if (ext === '.onnx') {
          info += `Type: ONNX model\n`;
        }

        return {
          content: [{ type: 'text' as const, text: info }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error analyzing model: ${error}` }],
          isError: true,
        };
      }
    }
  );
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

// Helper: Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
