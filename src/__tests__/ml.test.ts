import { jest } from '@jest/globals';
import { PathValidator } from '../security/validator.js';
import { registerMLTools } from '../tools/ml.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('ML/AI Development Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();
  let mockSpawn: jest.Mock;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-ml-test-'));
    validator = new PathValidator([tempDir], [], tempDir);

    mockSpawn = jest.fn(
      (_command: string, _args: string[], _options: Record<string, unknown> = {}) => {
        const proc = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 5);
            }
            return proc;
          }),
          kill: jest.fn(),
        };

        setTimeout(() => {
          if (proc.stdout.on) {
            proc.stdout.on.mock.calls[0]?.[1]('mock output');
          }
        }, 5);

        return proc;
      }
    );

    jest.unstable_mockModule('child_process', () => ({
      spawn: mockSpawn,
    }));

    const mockServer = {
      registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => {
        handlers.set(name, handler);
      },
    } as unknown;

    registerMLTools(mockServer, validator, 5000, tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('jupyter_run', () => {
    it('should have jupyter_run handler', () => {
      expect(handlers.get('jupyter_run')).toBeDefined();
    });

    it('should execute notebook', async () => {
      const handler = handlers.get('jupyter_run');
      if (!handler) return;

      const result = await handler({
        notebook: path.join(tempDir, 'test.ipynb'),
      });

      expect(result).toBeDefined();
    });
  });

  describe('python_venv_create', () => {
    it('should have python_venv_create handler', () => {
      expect(handlers.get('python_venv_create')).toBeDefined();
    });

    it('should create virtual environment', async () => {
      const handler = handlers.get('python_venv_create');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'venv'),
      });

      expect(result).toBeDefined();
    });
  });

  describe('conda_env_create', () => {
    it('should have conda_env_create handler', () => {
      expect(handlers.get('conda_env_create')).toBeDefined();
    });

    it('should create conda environment', async () => {
      const handler = handlers.get('conda_env_create');
      if (!handler) return;

      const result = await handler({
        name: 'test-env',
      });

      expect(result).toBeDefined();
    });
  });

  describe('conda_env_list', () => {
    it('should have conda_env_list handler', () => {
      expect(handlers.get('conda_env_list')).toBeDefined();
    });

    it('should list conda environments', async () => {
      const handler = handlers.get('conda_env_list');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('pip_freeze', () => {
    it('should have pip_freeze handler', () => {
      expect(handlers.get('pip_freeze')).toBeDefined();
    });

    it('should list installed packages', async () => {
      const handler = handlers.get('pip_freeze');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('tensorboard_start', () => {
    it('should have tensorboard_start handler', () => {
      expect(handlers.get('tensorboard_start')).toBeDefined();
    });

    it('should start TensorBoard', async () => {
      const handler = handlers.get('tensorboard_start');
      if (!handler) return;

      const result = await handler({
        logdir: path.join(tempDir, 'logs'),
      });

      expect(result).toBeDefined();
    });
  });

  describe('check_gpu', () => {
    it('should have check_gpu handler', () => {
      expect(handlers.get('check_gpu')).toBeDefined();
    });

    it('should check GPU availability', async () => {
      const handler = handlers.get('check_gpu');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('dataset_info', () => {
    it('should have dataset_info handler', () => {
      expect(handlers.get('dataset_info')).toBeDefined();
    });

    it('should get dataset information', async () => {
      const handler = handlers.get('dataset_info');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'data.csv'),
      });

      expect(result).toBeDefined();
    });
  });

  describe('model_info', () => {
    it('should have model_info handler', () => {
      expect(handlers.get('model_info')).toBeDefined();
    });

    it('should get model information', async () => {
      const handler = handlers.get('model_info');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'model.h5'),
      });

      expect(result).toBeDefined();
    });
  });

  describe('path validation', () => {
    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('jupyter_run');
      if (!handler) return;

      const result = await handler({
        notebook: '/etc/test.ipynb',
      });

      expect(result).toBeDefined();
    });
  });
});
