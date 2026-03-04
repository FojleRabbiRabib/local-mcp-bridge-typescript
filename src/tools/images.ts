import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PathValidator } from '../security/validator.js';
import fs from 'fs/promises';

// Image format detection using magic numbers (file signatures)
const IMAGE_MAGIC: Record<string, Buffer> = {
  'png': Buffer.from([0x89, 0x50, 0x4E, 0x47]),
  'jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
  'jpg': Buffer.from([0xFF, 0xD8, 0xFF]),
  'gif': Buffer.from([0x47, 0x49, 0x46]),
  'webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
  'bmp': Buffer.from([0x42, 0x4D]),
};

function detectImageFormat(buffer: Buffer): string {
  for (const [format, magic] of Object.entries(IMAGE_MAGIC)) {
    if (buffer.subarray(0, magic.length).equals(magic)) {
      // Normalize jpg to jpeg
      return format === 'jpg' ? 'jpeg' : format;
    }
  }
  return 'unknown';
}

export function registerImageTools(server: McpServer, validator: PathValidator): void {
  server.registerTool(
    'read_image',
    {
      description: 'Read an image file and return it as base64 data URI for viewing',
      inputSchema: z.object({
        filePath: z.string().describe('Path to the image file (relative to workspace)'),
      }),
    },
    async ({ filePath }) => {
      const validation = validator.validate(filePath);

      if (!validation.valid) {
        return {
          content: [
            {
              type: 'text',
              text: validation.error!,
            },
          ],
          isError: true,
        };
      }

      const absolutePath = validation.resolvedPath!;

      // Check if file exists and is accessible
      try {
        await fs.access(absolutePath);
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: `Error: File not found or not accessible: ${filePath}`,
            },
          ],
          isError: true,
        };
      }

      // Read file as buffer
      const buffer = await fs.readFile(absolutePath);

      // Detect format
      const format = detectImageFormat(buffer);
      const mimeType = `image/${format}`;

      // Convert to base64
      const base64 = buffer.toString('base64');

      return {
        content: [
          {
            type: 'text',
            text: `data:${mimeType};base64,${base64}`,
          },
        ],
      };
    }
  );
}
