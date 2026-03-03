import { PathValidator } from '../security/validator.js';
import { registerFileSystemTools } from '../tools/filesystem.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Filesystem Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));

    // Create test files
    await fs.writeFile(path.join(tempDir, 'test1.ts'), 'import com.auth0;\nconsole.log("hello");');
    await fs.writeFile(path.join(tempDir, 'test2.ts'), 'function test() {\n  return 42;\n}');
    await fs.mkdir(path.join(tempDir, 'subdir'));
    await fs.writeFile(
      path.join(tempDir, 'subdir', 'test3.java'),
      'package com.example;\nimport com.auth0;'
    );
    await fs.writeFile(
      path.join(tempDir, 'subdir', 'test4.java'),
      'class Test {}\nimport COM.AUTH0;'
    );

    // Create validator that allows temp directory
    validator = new PathValidator([tempDir], [], tempDir);

    // Create mock server that captures all tool handlers
    handlers.clear();
    const mockServer = {
      registerTool: (name: string, _config: Record<string, unknown>, handler: ToolHandler) => {
        handlers.set(name, handler);
      },
    } as {
      registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => void;
    };

    // Register filesystem tools
    registerFileSystemTools(mockServer, validator, 1024 * 1024, tempDir, 5000);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('search_files - file search', () => {
    it('should search for literal string in a single file', async () => {
      const handler = handlers.get('search_files');
      expect(handler).toBeDefined();

      const result = await handler({
        pattern: 'import com.auth0',
        path: path.join(tempDir, 'test1.ts'),
      });

      expect(result).toBeDefined();
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('import com.auth0');
      // Note: When searching a single file (not using -r), grep doesn't include filename
      expect(result.content[0].text).toMatch(/\d+:\s*import com\.auth0/);
    });

    it('should treat pattern as literal string (not regex)', async () => {
      const handler = handlers.get('search_files');
      // The dot should be treated as literal, not regex "any character"
      const result = await handler({
        pattern: 'com.auth0',
        path: path.join(tempDir, 'test1.ts'),
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('com.auth0');
      // Should NOT match "comXauth0" or similar
      expect(result.content[0].text).not.toContain('No matches found');
    });

    it('should be case insensitive', async () => {
      const handler = handlers.get('search_files');
      const result = await handler({
        pattern: 'IMPORT',
        path: tempDir,
      });

      expect(result.isError).not.toBe(true);
      // Should find "import" (case insensitive)
      expect(result.content[0].text).toContain('import');
      expect(result.content[0].text).not.toContain('No matches found');
    });

    it('should return "No matches found" when pattern does not exist', async () => {
      const handler = handlers.get('search_files');
      const result = await handler({
        pattern: 'nonexistent_pattern_xyz',
        path: tempDir,
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('No matches found');
    });
  });

  describe('search_files - directory search', () => {
    it('should search recursively in directory', async () => {
      const handler = handlers.get('search_files');
      const result = await handler({
        pattern: 'import',
        path: tempDir,
      });

      expect(result.isError).not.toBe(true);
      const text = result.content[0].text;
      // Should find imports in both root and subdirectory
      expect(text).toContain('import');
      expect(text).toContain('test1.ts');
    });

    it('should exclude common directories like node_modules', async () => {
      const handler = handlers.get('search_files');
      // Create a node_modules directory with a matching file
      await fs.mkdir(path.join(tempDir, 'node_modules'));
      await fs.writeFile(path.join(tempDir, 'node_modules', 'package.ts'), 'import test;');

      const result = await handler({
        pattern: 'import',
        path: tempDir,
      });

      expect(result.isError).not.toBe(true);
      const text = result.content[0].text;
      // Should not include node_modules results
      expect(text).not.toContain('node_modules');
    });
  });

  describe('search_files - validation', () => {
    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('search_files');
      const result = await handler({
        pattern: 'test',
        path: '/etc/passwd',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });

  describe('search_files - special characters', () => {
    it('should handle special regex characters literally', async () => {
      const handler = handlers.get('search_files');
      // Create a file with special characters
      await fs.writeFile(
        path.join(tempDir, 'special.txt'),
        'function test()\nvalue: 42.5\n( parenthesis'
      );

      const result1 = await handler({
        pattern: 'test()',
        path: path.join(tempDir, 'special.txt'),
      });

      expect(result1.isError).not.toBe(true);
      expect(result1.content[0].text).toContain('test()');

      const result2 = await handler({
        pattern: '42.5',
        path: path.join(tempDir, 'special.txt'),
      });

      expect(result2.isError).not.toBe(true);
      expect(result2.content[0].text).toContain('42.5');

      const result3 = await handler({
        pattern: '( parenthesis',
        path: path.join(tempDir, 'special.txt'),
      });

      expect(result3.isError).not.toBe(true);
      expect(result3.content[0].text).toContain('( parenthesis');
    });

    it('should handle dots as literal characters', async () => {
      const handler = handlers.get('search_files');
      const result = await handler({
        pattern: '.auth0',
        path: path.join(tempDir, 'test1.ts'),
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('.auth0');
    });
  });

  describe('search_files - file vs directory detection', () => {
    it('should not use -r flag when searching a single file', async () => {
      const handler = handlers.get('search_files');
      const result = await handler({
        pattern: 'import',
        path: path.join(tempDir, 'test1.ts'),
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('import com.auth0');
    });

    it('should use -r flag when searching a directory', async () => {
      const handler = handlers.get('search_files');
      const result = await handler({
        pattern: 'import',
        path: tempDir,
      });

      expect(result.isError).not.toBe(true);
      // Should find results in subdirectory
      expect(result.content[0].text).toContain('import');
    });
  });

  // ===== read_file tests =====
  describe('read_file', () => {
    it('should read file content', async () => {
      const handler = handlers.get('read_file');
      expect(handler).toBeDefined();

      const result = await handler({ path: path.join(tempDir, 'test1.ts') });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('import com.auth0');
      expect(result.content[0].text).toContain('console.log("hello")');
    });

    it('should handle non-existent file', async () => {
      const handler = handlers.get('read_file');

      const result = await handler({ path: path.join(tempDir, 'nonexistent.txt') });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('ENOENT');
    });

    it('should reject paths outside allowed paths', async () => {
      const handler = handlers.get('read_file');

      const result = await handler({ path: '/etc/passwd' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });
  });

  // ===== write_file tests =====
  describe('write_file', () => {
    it('should write content to a file', async () => {
      const handler = handlers.get('write_file');
      const filePath = path.join(tempDir, 'new-file.txt');

      const result = await handler({
        path: filePath,
        content: 'Hello, World!',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('Successfully');

      // Verify file was written
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello, World!');
    });

    it('should create directories if they do not exist', async () => {
      const handler = handlers.get('write_file');
      const filePath = path.join(tempDir, 'nested', 'dir', 'file.txt');

      const result = await handler({
        path: filePath,
        content: 'Nested content',
      });

      expect(result.isError).not.toBe(true);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Nested content');
    });
  });

  // ===== list_directory tests =====
  describe('list_directory', () => {
    it('should list directory contents', async () => {
      const handler = handlers.get('list_directory');

      const result = await handler({ path: tempDir });

      expect(result.isError).not.toBe(true);
      const text = result.content[0].text;
      expect(text).toContain('test1.ts');
      expect(text).toContain('test2.ts');
      expect(text).toContain('subdir');
    });

    it('should handle non-existent directory', async () => {
      const handler = handlers.get('list_directory');

      const result = await handler({ path: path.join(tempDir, 'nonexistent') });

      expect(result.isError).toBe(true);
    });
  });

  // ===== create_directory tests =====
  describe('create_directory', () => {
    it('should create a new directory', async () => {
      const handler = handlers.get('create_directory');
      const dirPath = path.join(tempDir, 'new-dir');

      const result = await handler({ path: dirPath });

      expect(result.isError).not.toBe(true);

      // Verify directory was created
      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories', async () => {
      const handler = handlers.get('create_directory');
      const dirPath = path.join(tempDir, 'a', 'b', 'c');

      const result = await handler({ path: dirPath });

      expect(result.isError).not.toBe(true);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  // ===== delete_file tests =====
  describe('delete_file', () => {
    it('should delete a file', async () => {
      const handler = handlers.get('delete_file');
      const filePath = path.join(tempDir, 'test1.ts');

      const result = await handler({ path: filePath });

      expect(result.isError).not.toBe(true);

      // Verify file was deleted
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('should fail to delete non-empty directory', async () => {
      const handler = handlers.get('delete_file');

      // delete_file uses fs.unlink which doesn't work for directories
      const result = await handler({ path: path.join(tempDir, 'subdir') });

      expect(result.isError).toBe(true);
    });
  });

  // ===== edit_file tests =====
  describe('edit_file', () => {
    it('should search and replace in file', async () => {
      const handler = handlers.get('edit_file');
      const filePath = path.join(tempDir, 'test2.ts');

      const result = await handler({
        path: filePath,
        oldText: 'return 42',
        newText: 'return 43',
      });

      expect(result.isError).not.toBe(true);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('return 43');
      expect(content).not.toContain('return 42');
    });

    it('should handle oldText not found', async () => {
      const handler = handlers.get('edit_file');

      const result = await handler({
        path: path.join(tempDir, 'test2.ts'),
        oldText: 'not found string',
        newText: 'replacement',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  // ===== replace_lines tests =====
  describe('replace_lines', () => {
    it('should replace specific lines in file', async () => {
      const handler = handlers.get('replace_lines');
      const filePath = path.join(tempDir, 'test2.ts');

      const result = await handler({
        path: filePath,
        startLine: 1,
        endLine: 2,
        newContent: '// Replaced content',
      });

      expect(result.isError).not.toBe(true);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('// Replaced content');
    });
  });

  // ===== insert_lines tests =====
  describe('insert_lines', () => {
    it('should insert lines after specified line', async () => {
      const handler = handlers.get('insert_lines');
      const filePath = path.join(tempDir, 'test2.ts');

      const result = await handler({
        path: filePath,
        afterLine: 0,
        content: '// Inserted at beginning',
      });

      expect(result.isError).not.toBe(true);

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      expect(lines[0]).toContain('// Inserted at beginning');
    });
  });

  // ===== delete_lines tests =====
  describe('delete_lines', () => {
    it('should delete specific lines from file', async () => {
      const handler = handlers.get('delete_lines');
      const filePath = path.join(tempDir, 'test2.ts');

      // First, create a file with known content
      await fs.writeFile(filePath, 'line1\nline2\nline3\nline4');

      const result = await handler({
        path: filePath,
        startLine: 2,
        endLine: 3,
      });

      expect(result.isError).not.toBe(true);

      const newContent = await fs.readFile(filePath, 'utf-8');
      const newLines = newContent.split('\n');
      expect(newLines).toEqual(['line1', 'line4']);
    });
  });
});
