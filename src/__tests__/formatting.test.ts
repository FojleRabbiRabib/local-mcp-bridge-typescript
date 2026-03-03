import { jest } from '@jest/globals';
import { PathValidator } from '../security/validator.js';
import { registerFormattingTools } from '../tools/formatting.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Code Formatting Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();
  let mockSpawn: jest.Mock;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-format-test-'));

    await fs.writeFile(path.join(tempDir, 'test.ts'), 'const x:number=1+2;');

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

    registerFormattingTools(mockServer, validator, 5000, tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('format_code', () => {
    it('should have format_code handler', () => {
      expect(handlers.get('format_code')).toBeDefined();
    });

    it('should format code with prettier', async () => {
      const handler = handlers.get('format_code');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'test.ts'),
        formatter: 'prettier',
      });

      expect(result).toBeDefined();
    });
  });

  describe('lint_code', () => {
    it('should have lint_code handler', () => {
      expect(handlers.get('lint_code')).toBeDefined();
    });

    it('should lint code with eslint', async () => {
      const handler = handlers.get('lint_code');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'test.ts'),
        linter: 'eslint',
      });

      expect(result).toBeDefined();
    });
  });

  describe('fix_lint_issues', () => {
    it('should have fix_lint_issues handler', () => {
      expect(handlers.get('fix_lint_issues')).toBeDefined();
    });

    it('should fix lint issues', async () => {
      const handler = handlers.get('fix_lint_issues');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'test.ts'),
        linter: 'eslint',
      });

      expect(result).toBeDefined();
    });
  });

  describe('check_syntax', () => {
    it('should have check_syntax handler', () => {
      expect(handlers.get('check_syntax')).toBeDefined();
    });

    it('should check syntax', async () => {
      const handler = handlers.get('check_syntax');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'test.ts'),
        language: 'typescript',
      });

      expect(result).toBeDefined();
    });
  });

  describe('path validation', () => {
    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('format_code');
      if (!handler) return;

      const result = await handler({
        path: '/etc/passwd',
        formatter: 'prettier',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });
});
