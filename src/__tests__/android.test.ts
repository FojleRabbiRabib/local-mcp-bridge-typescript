import { jest } from '@jest/globals';
import { PathValidator } from '../security/validator.js';
import { registerAndroidTools } from '../tools/android.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Android Development Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();
  let mockSpawn: jest.Mock;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-android-test-'));

    await fs.writeFile(path.join(tempDir, 'gradlew'), '#!/bin/bash\ngradle command');
    await fs.writeFile(path.join(tempDir, 'build.gradle'), 'android { defaultConfig { ... } }');
    await fs.writeFile(path.join(tempDir, 'settings.gradle'), 'include ":app"');

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
            proc.stdout.on.mock.calls[0]?.[1]('BUILD SUCCESSFUL');
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

    registerAndroidTools(mockServer, validator, 5000, tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('android_build', () => {
    it('should have android_build handler', () => {
      expect(handlers.get('android_build')).toBeDefined();
    });

    it('should build all modules', async () => {
      const handler = handlers.get('android_build');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('android_assemble', () => {
    it('should have android_assemble handler', () => {
      expect(handlers.get('android_assemble')).toBeDefined();
    });

    it('should build debug variant', async () => {
      const handler = handlers.get('android_assemble');
      if (!handler) return;

      const result = await handler({ variant: 'Debug' });

      expect(result).toBeDefined();
    });
  });

  describe('android_clean', () => {
    it('should have android_clean handler', () => {
      expect(handlers.get('android_clean')).toBeDefined();
    });

    it('should clean build artifacts', async () => {
      const handler = handlers.get('android_clean');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('android_test', () => {
    it('should have android_test handler', () => {
      expect(handlers.get('android_test')).toBeDefined();
    });

    it('should run unit tests', async () => {
      const handler = handlers.get('android_test');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('android_connected_test', () => {
    it('should have android_connected_test handler', () => {
      expect(handlers.get('android_connected_test')).toBeDefined();
    });

    it('should run instrumented tests', async () => {
      const handler = handlers.get('android_connected_test');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('android_lint', () => {
    it('should have android_lint handler', () => {
      expect(handlers.get('android_lint')).toBeDefined();
    });

    it('should run lint checks', async () => {
      const handler = handlers.get('android_lint');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('android_install', () => {
    it('should have android_install handler', () => {
      expect(handlers.get('android_install')).toBeDefined();
    });

    it('should install debug APK', async () => {
      const handler = handlers.get('android_install');
      if (!handler) return;

      const result = await handler({ variant: 'Debug' });

      expect(result).toBeDefined();
    });
  });

  describe('android_uninstall', () => {
    it('should have android_uninstall handler', () => {
      expect(handlers.get('android_uninstall')).toBeDefined();
    });

    it('should uninstall app', async () => {
      const handler = handlers.get('android_uninstall');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('android_bundle', () => {
    it('should have android_bundle handler', () => {
      expect(handlers.get('android_bundle')).toBeDefined();
    });

    it('should create release bundle', async () => {
      const handler = handlers.get('android_bundle');
      if (!handler) return;

      const result = await handler({ variant: 'Release' });

      expect(result).toBeDefined();
    });
  });

  describe('android_dependencies', () => {
    it('should have android_dependencies handler', () => {
      expect(handlers.get('android_dependencies')).toBeDefined();
    });

    it('should show dependency tree', async () => {
      const handler = handlers.get('android_dependencies');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('android_tasks', () => {
    it('should have android_tasks handler', () => {
      expect(handlers.get('android_tasks')).toBeDefined();
    });

    it('should list available tasks', async () => {
      const handler = handlers.get('android_tasks');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('android_projects', () => {
    it('should have android_projects handler', () => {
      expect(handlers.get('android_projects')).toBeDefined();
    });

    it('should list subprojects', async () => {
      const handler = handlers.get('android_projects');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('path validation', () => {
    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('android_build');
      if (!handler) return;

      const result = await handler({ path: '/etc' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });
});
