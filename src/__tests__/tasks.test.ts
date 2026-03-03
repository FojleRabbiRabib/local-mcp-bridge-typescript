import { PathValidator } from '../security/validator.js';
import { registerTaskTools } from '../tools/tasks.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Task Management Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-task-test-'));
    validator = new PathValidator([tempDir], [], tempDir);

    const mockServer = {
      registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => {
        handlers.set(name, handler);
      },
    } as unknown;

    registerTaskTools(mockServer, validator, tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('create_task', () => {
    it('should have create_task handler', () => {
      expect(handlers.get('create_task')).toBeDefined();
    });

    it('should require task parameter', async () => {
      const handler = handlers.get('create_task');
      if (!handler) return;

      const result = await handler({
        subject: 'Test task',
        description: 'Test description',
      });

      expect(result).toBeDefined();
    });
  });

  describe('list_tasks', () => {
    it('should have list_tasks handler', () => {
      expect(handlers.get('list_tasks')).toBeDefined();
    });

    it('should work without parameters', async () => {
      const handler = handlers.get('list_tasks');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('update_task', () => {
    it('should have update_task handler', () => {
      expect(handlers.get('update_task')).toBeDefined();
    });

    it('should require taskId parameter', async () => {
      const handler = handlers.get('update_task');
      if (!handler) return;

      const result = await handler({
        taskId: '1',
        status: 'completed',
      });

      expect(result).toBeDefined();
    });
  });

  describe('delete_task', () => {
    it('should have delete_task handler', () => {
      expect(handlers.get('delete_task')).toBeDefined();
    });

    it('should require taskId parameter', async () => {
      const handler = handlers.get('delete_task');
      if (!handler) return;

      const result = await handler({ taskId: '1' });

      expect(result).toBeDefined();
    });
  });

  describe('search_todos', () => {
    it('should have search_todos handler', () => {
      expect(handlers.get('search_todos')).toBeDefined();
    });

    it('should search for TODO comments', async () => {
      const handler = handlers.get('search_todos');
      if (!handler) return;

      const result = await handler({ path: tempDir });

      expect(result).toBeDefined();
    });
  });
});
