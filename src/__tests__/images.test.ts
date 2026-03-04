import { PathValidator } from '../security/validator.js';
import { registerImageTools } from '../tools/images.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

describe('Image Tools', () => {
  let tempDir: string;
  let validator: PathValidator;
  const handlers = new Map<string, ToolHandler>();

  // Test image data (1x1 red pixel PNG)
  const testPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  // Test image data (minimal JPEG)
  const testJpegBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AT//Z';

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-image-test-'));

    // Create test image files
    const pngBuffer = Buffer.from(testPngBase64, 'base64');
    await fs.writeFile(path.join(tempDir, 'test.png'), pngBuffer);

    const jpegBuffer = Buffer.from(testJpegBase64, 'base64');
    await fs.writeFile(path.join(tempDir, 'test.jpg'), jpegBuffer);

    // Create a subdirectory with an image
    await fs.mkdir(path.join(tempDir, 'subdir'));
    await fs.writeFile(path.join(tempDir, 'subdir', 'nested.png'), pngBuffer);

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

    // Register image tools
    registerImageTools(mockServer, validator);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('read_image', () => {
    it('should be registered', () => {
      const handler = handlers.get('read_image');
      expect(handler).toBeDefined();
    });

    it('should read a PNG image and return base64 data URI', async () => {
      const handler = handlers.get('read_image')!;
      const result = await handler({ filePath: 'test.png' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toMatch(/^data:image\/png;base64,/);
      expect(result.content[0].text).toContain(testPngBase64);
    });

    it('should read a JPEG image and return base64 data URI', async () => {
      const handler = handlers.get('read_image')!;
      const result = await handler({ filePath: 'test.jpg' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should read an image from a subdirectory', async () => {
      const handler = handlers.get('read_image')!;
      const result = await handler({ filePath: 'subdir/nested.png' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toMatch(/^data:image\/png;base64,/);
    });

    it('should handle absolute paths within allowed directory', async () => {
      const handler = handlers.get('read_image')!;
      const absolutePath = path.join(tempDir, 'test.png');
      const result = await handler({ filePath: absolutePath });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toMatch(/^data:image\/png;base64,/);
    });

    it('should return error for non-existent file', async () => {
      const handler = handlers.get('read_image')!;
      const result = await handler({ filePath: 'nonexistent.png' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found or not accessible');
    });

    it('should return error for paths outside allowed directory', async () => {
      const handler = handlers.get('read_image')!;
      const result = await handler({ filePath: '/etc/passwd' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should return error for denied paths', async () => {
      // Create a new validator with denied paths
      const restrictedValidator = new PathValidator([tempDir], [path.join(tempDir, 'subdir')], tempDir);
      const mockServer = {
        registerTool: (name: string, _config: Record<string, unknown>, handler: ToolHandler) => {
          handlers.set(name, handler);
        },
      } as {
        registerTool: (name: string, config: Record<string, unknown>, handler: ToolHandler) => void;
      };
      registerImageTools(mockServer, restrictedValidator);

      const handler = handlers.get('read_image')!;
      const result = await handler({ filePath: 'subdir/nested.png' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    it('should handle reading an empty file gracefully', async () => {
      // Create empty file
      await fs.writeFile(path.join(tempDir, 'empty.png'), Buffer.from([]));

      const handler = handlers.get('read_image')!;
      const result = await handler({ filePath: 'empty.png' });

      // Should still return a data URI, just with unknown format
      expect(result.content[0].text).toMatch(/^data:image\/unknown;base64,$/);
    });
  });
});
