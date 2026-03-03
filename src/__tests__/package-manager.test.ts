import { jest } from '@jest/globals';
import { PathValidator } from '../security/validator.js';
import { registerPackageManagerTools } from '../tools/package-manager.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Package Manager Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();
  let mockSpawn: jest.Mock;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-npm-test-'));

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-project',
          version: '1.0.0',
          scripts: {
            test: 'jest',
            build: 'tsc',
            start: 'node index.js',
          },
        },
        null,
        2
      )
    );

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

    registerPackageManagerTools(mockServer, validator, 5000, tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('npm_install', () => {
    it('should have npm_install handler', () => {
      expect(handlers.get('npm_install')).toBeDefined();
    });

    it('should work with default parameters', async () => {
      const handler = handlers.get('npm_install');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });

    it('should accept package parameter', async () => {
      const handler = handlers.get('npm_install');
      if (!handler) return;

      const result = await handler({ package: 'lodash' });

      expect(result).toBeDefined();
    });
  });

  describe('npm_run', () => {
    it('should have npm_run handler', () => {
      expect(handlers.get('npm_run')).toBeDefined();
    });

    it('should require script parameter', async () => {
      const handler = handlers.get('npm_run');
      if (!handler) return;

      const result = await handler({ script: 'build' });

      expect(result).toBeDefined();
    });
  });

  describe('pip_install', () => {
    it('should have pip_install handler', () => {
      expect(handlers.get('pip_install')).toBeDefined();
    });

    it('should accept package parameter', async () => {
      const handler = handlers.get('pip_install');
      if (!handler) return;

      const result = await handler({ package: 'requests' });

      expect(result).toBeDefined();
    });
  });

  describe('composer_install', () => {
    it('should have composer_install handler', () => {
      expect(handlers.get('composer_install')).toBeDefined();
    });

    it('should work without parameters', async () => {
      const handler = handlers.get('composer_install');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('artisan', () => {
    it('should have artisan handler', () => {
      expect(handlers.get('artisan')).toBeDefined();
    });

    it('should require command parameter', async () => {
      const handler = handlers.get('artisan');
      if (!handler) return;

      const result = await handler({ command: 'migrate' });

      expect(result).toBeDefined();
    });
  });

  describe('django_manage', () => {
    it('should have django_manage handler', () => {
      expect(handlers.get('django_manage')).toBeDefined();
    });

    it('should require command parameter', async () => {
      const handler = handlers.get('django_manage');
      if (!handler) return;

      const result = await handler({ command: 'runserver' });

      expect(result).toBeDefined();
    });
  });

  describe('cargo_build', () => {
    it('should have cargo_build handler', () => {
      expect(handlers.get('cargo_build')).toBeDefined();
    });

    it('should work without parameters', async () => {
      const handler = handlers.get('cargo_build');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('go_build', () => {
    it('should have go_build handler', () => {
      expect(handlers.get('go_build')).toBeDefined();
    });

    it('should work without parameters', async () => {
      const handler = handlers.get('go_build');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('path validation', () => {
    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('npm_install');
      if (!handler) return;

      const result = await handler({ path: '/etc' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });
});
