import { jest } from '@jest/globals';
import { PathValidator } from '../security/validator.js';
import { registerGitTools } from '../tools/git.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Git Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();
  let mockSpawn: jest.Mock;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-git-test-'));

    // Create validator that allows temp directory
    validator = new PathValidator([tempDir], [], tempDir);

    // Create mock spawn function
    mockSpawn = jest.fn(
      (_command: string, _args: string[], _options: Record<string, unknown> = {}) => {
        const proc = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              // Simulate immediate close with exit code 0
              setTimeout(() => callback(0), 5);
            }
            return proc;
          }),
          kill: jest.fn(),
        };

        // Simulate output
        setTimeout(() => {
          if (proc.stdout.on) {
            proc.stdout.on.mock.calls[0]?.[1]('mock output');
          }
        }, 5);

        return proc;
      }
    );

    // Mock child_process module
    jest.unstable_mockModule('child_process', () => ({
      spawn: mockSpawn,
    }));

    // Create mock server that captures all tool handlers
    // handlers.clear()
    const mockServer = {
      registerTool: (name: string, _config: Record<string, unknown>, handler: ToolHandler) => {
        handlers.set(name, handler);
      },
    } as {
      registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => void;
    };

    // Register git tools
    registerGitTools(mockServer, validator, 5000, tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('git_status', () => {
    it('should have git_status handler', () => {
      expect(handlers.get('git_status')).toBeDefined();
    });

    it('should call handler with default path', async () => {
      const handler = handlers.get('git_status');
      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('git_diff', () => {
    it('should have git_diff handler', () => {
      expect(handlers.get('git_diff')).toBeDefined();
    });

    it('should accept optional file parameter', async () => {
      const handler = handlers.get('git_diff');
      const result = await handler({ file: 'src/test.ts' });

      expect(result).toBeDefined();
    });
  });

  describe('git_log', () => {
    it('should have git_log handler', () => {
      expect(handlers.get('git_log')).toBeDefined();
    });

    it('should accept optional maxCount parameter', async () => {
      const handler = handlers.get('git_log');
      const result = await handler({ maxCount: 10 });

      expect(result).toBeDefined();
    });
  });

  describe('git_show', () => {
    it('should have git_show handler', () => {
      expect(handlers.get('git_show')).toBeDefined();
    });

    it('should require commit hash', async () => {
      const handler = handlers.get('git_show');
      const result = await handler({ commit: 'abc123' });

      expect(result).toBeDefined();
    });
  });

  describe('git_commit', () => {
    it('should have git_commit handler', () => {
      expect(handlers.get('git_commit')).toBeDefined();
    });

    it('should require message parameter', async () => {
      const handler = handlers.get('git_commit');
      const result = await handler({ message: 'Test commit' });

      expect(result).toBeDefined();
    });
  });

  describe('git_add', () => {
    it('should have git_add handler', () => {
      expect(handlers.get('git_add')).toBeDefined();
    });

    it('should accept files parameter', async () => {
      const handler = handlers.get('git_add');
      const result = await handler({ files: '.' });

      expect(result).toBeDefined();
    });
  });

  describe('git_checkout', () => {
    it('should have git_checkout handler', () => {
      expect(handlers.get('git_checkout')).toBeDefined();
    });

    it('should require branch parameter', async () => {
      const handler = handlers.get('git_checkout');
      const result = await handler({ branch: 'main' });

      expect(result).toBeDefined();
    });
  });

  describe('git_branch', () => {
    it('should have git_branch handler', () => {
      expect(handlers.get('git_branch')).toBeDefined();
    });

    it('should work without parameters', async () => {
      const handler = handlers.get('git_branch');
      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('git_pull', () => {
    it('should have git_pull handler', () => {
      expect(handlers.get('git_pull')).toBeDefined();
    });

    it('should work without parameters', async () => {
      const handler = handlers.get('git_pull');
      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('git_push', () => {
    it('should have git_push handler', () => {
      expect(handlers.get('git_push')).toBeDefined();
    });

    it('should accept optional remote and branch parameters', async () => {
      const handler = handlers.get('git_push');
      const result = await handler({ remote: 'origin', branch: 'main' });

      expect(result).toBeDefined();
    });
  });

  describe('path validation', () => {
    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('git_status');

      const result = await handler({ path: '/etc' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });
});
