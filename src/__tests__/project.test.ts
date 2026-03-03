import { PathValidator } from '../security/validator.js';
import { registerProjectTools } from '../tools/project.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Project Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-project-test-'));

    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.mkdir(path.join(tempDir, 'tests'));
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        scripts: {
          test: 'jest',
          build: 'tsc',
        },
      })
    );
    await fs.writeFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
        },
      })
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'index.ts'),
      'export function hello() { return "world"; }'
    );

    validator = new PathValidator([tempDir], [], tempDir);

    const mockServer = {
      registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => {
        handlers.set(name, handler);
      },
    } as unknown;

    registerProjectTools(mockServer, validator, tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('get_project_structure', () => {
    it('should have get_project_structure handler', () => {
      expect(handlers.get('get_project_structure')).toBeDefined();
    });

    it('should return project structure', async () => {
      const handler = handlers.get('get_project_structure');
      if (!handler) return;

      const result = await handler({ path: tempDir });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('package.json');
    });

    it('should work with default path', async () => {
      const handler = handlers.get('get_project_structure');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('analyze_project', () => {
    it('should have analyze_project handler', () => {
      expect(handlers.get('analyze_project')).toBeDefined();
    });

    it('should analyze Node.js/TypeScript project', async () => {
      const handler = handlers.get('analyze_project');
      if (!handler) return;

      const result = await handler({ path: tempDir });

      expect(result.isError).not.toBe(true);
      const text = result.content[0].text;
      expect(text).toBeDefined();
      expect(text.length).toBeGreaterThan(0);
    });

    it('should work with default path', async () => {
      const handler = handlers.get('analyze_project');
      if (!handler) return;

      const result = await handler({});

      expect(result).toBeDefined();
    });
  });

  describe('find_files', () => {
    it('should have find_files handler', () => {
      expect(handlers.get('find_files')).toBeDefined();
    });

    it('should find files by pattern', async () => {
      const handler = handlers.get('find_files');
      if (!handler) return;

      const result = await handler({
        path: tempDir,
        pattern: '*.json',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('package.json');
    });

    it('should support recursive search', async () => {
      const handler = handlers.get('find_files');
      if (!handler) return;

      const result = await handler({
        path: tempDir,
        pattern: '*.ts',
        recursive: true,
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('index.ts');
    });
  });

  describe('get_file_info', () => {
    it('should have get_file_info handler', () => {
      expect(handlers.get('get_file_info')).toBeDefined();
    });

    it('should return file information', async () => {
      const handler = handlers.get('get_file_info');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'package.json'),
      });

      expect(result.isError).not.toBe(true);
      const text = result.content[0].text;
      expect(text).toBeDefined();
      expect(text.length).toBeGreaterThan(0);
    });

    it('should handle non-existent file', async () => {
      const handler = handlers.get('get_file_info');
      if (!handler) return;

      const result = await handler({
        path: path.join(tempDir, 'nonexistent.txt'),
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('path validation', () => {
    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('analyze_project');
      if (!handler) return;

      const result = await handler({ path: '/etc' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });
});
