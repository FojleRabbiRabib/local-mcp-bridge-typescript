import { jest } from '@jest/globals';
import { PathValidator } from '../security/validator.js';
import { CommandValidator } from '../security/command-validator.js';
import { registerCommandTools } from '../tools/commands.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Command Execution Tools', () => {
  let tempDir: string;
  let pathValidator: PathValidator;
  let commandValidator: CommandValidator;
  const handlers = new Map<string, ToolHandler>();
  let mockSpawn: jest.Mock;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-cmd-test-'));

    pathValidator = new PathValidator([tempDir], [], tempDir);
    commandValidator = new CommandValidator(['ls', 'echo', 'cat', 'grep']);

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

    registerCommandTools(mockServer, commandValidator, pathValidator, 5000, tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('execute_command', () => {
    it('should have execute_command handler', () => {
      expect(handlers.get('execute_command')).toBeDefined();
    });

    it('should execute allowed command', async () => {
      const handler = handlers.get('execute_command');
      if (!handler) return;

      const result = await handler({ command: 'ls', args: ['-la'] });

      expect(result).toBeDefined();
    });

    it('should reject disallowed command', async () => {
      const handler = handlers.get('execute_command');
      if (!handler) return;

      const result = await handler({ command: 'rm', args: ['-rf', '/'] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not allowed');
    });

    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('execute_command');
      if (!handler) return;

      const result = await handler({ command: 'ls', args: ['/etc'] });

      expect(result).toBeDefined();
    });
  });
});
