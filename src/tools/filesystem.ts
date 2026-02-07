import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';

export function registerFileSystemTools(
  server: McpServer,
  validator: PathValidator,
  maxFileSize: number
) {
  // read_file tool - Read contents of a file
  server.registerTool(
    'read_file',
    {
      description:
        'Read the contents of a file. Can read entire file or specific line ranges (start/end). MUCH MORE EFFICIENT to read only the lines you need instead of the entire file for large files. ALWAYS use this before editing a file to understand its current state.',
      inputSchema: z.object({
        path: z.string().describe('Path to the file to read'),
        startLine: z.number().optional().describe('Start line number (1-indexed, optional)'),
        endLine: z.number().optional().describe('End line number (inclusive, 1-indexed, optional)'),
      }),
    },
    async ({ path: filePath, startLine, endLine }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        const stats = await fs.stat(filePath);

        if (!stats.isFile()) {
          return {
            content: [{ type: 'text', text: `Error: ${filePath} is not a file` }],
            isError: true,
          };
        }

        if (stats.size > maxFileSize) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: File too large (${stats.size} bytes, max ${maxFileSize} bytes)`,
              },
            ],
            isError: true,
          };
        }

        const content = await fs.readFile(filePath, 'utf-8');

        // If start/end lines specified, return only those lines
        if (startLine !== undefined || endLine !== undefined) {
          const lines = content.split('\n');
          const start = startLine !== undefined ? Math.max(1, startLine) : 1;
          const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;

          if (start > lines.length) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: startLine ${start} is out of range (file has ${lines.length} lines)`,
                },
              ],
              isError: true,
            };
          }

          if (end < start) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: endLine ${end} is less than startLine ${start}`,
                },
              ],
              isError: true,
            };
          }

          const selectedLines = lines.slice(start - 1, end);
          return {
            content: [
              {
                type: 'text',
                text: selectedLines.join('\n'),
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error reading file: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // write_file tool - Write content to a file
  server.registerTool(
    'write_file',
    {
      description:
        "Create a new file or completely replace an existing file's content. IMPORTANT: Only use this for NEW files or when you need to REPLACE the entire content. For modifying existing files, use edit_file instead to save resources and reduce costs.",
      inputSchema: z.object({
        path: z.string().describe('Path to the file to write'),
        content: z.string().describe('Content to write to the file'),
      }),
    },
    async ({ path: filePath, content }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        // Ensure parent directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, content, 'utf-8');
        return {
          content: [{ type: 'text', text: `Successfully wrote to ${filePath}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error writing file: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // list_directory tool - List contents of a directory
  server.registerTool(
    'list_directory',
    {
      description:
        "List all files and subdirectories in a directory. USE THIS to see what's in a folder before navigating or operating on its contents.",
      inputSchema: z.object({
        path: z.string().describe('Path to the directory to list'),
      }),
    },
    async ({ path: dirPath }) => {
      const validation = validator.validate(dirPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        const stats = await fs.stat(dirPath);

        if (!stats.isDirectory()) {
          return {
            content: [{ type: 'text', text: `Error: ${dirPath} is not a directory` }],
            isError: true,
          };
        }

        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => {
            const type = entry.isDirectory() ? '[DIR] ' : '[FILE]';
            return `${type} ${entry.name}`;
          })
          .join('\n');

        return {
          content: [{ type: 'text', text: formatted || '(empty directory)' }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error listing directory: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // edit_file tool - Edit file with search and replace
  server.registerTool(
    'edit_file',
    {
      description:
        "Modify an existing file by searching for and replacing specific text. PREFERRED over write_file for making changes to existing files. This is more efficient and cost-effective as it only changes what's needed. Use this when you need to update, add to, or modify parts of an existing file.",
      inputSchema: z.object({
        path: z.string().describe('Path to the file to edit'),
        oldText: z.string().describe('Text to find and replace'),
        newText: z.string().describe('Text to replace with'),
      }),
    },
    async ({ path: filePath, oldText, newText }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        const stats = await fs.stat(filePath);

        if (stats.size > maxFileSize) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: File too large (${stats.size} bytes, max ${maxFileSize} bytes)`,
              },
            ],
            isError: true,
          };
        }

        let content = await fs.readFile(filePath, 'utf-8');

        if (!content.includes(oldText)) {
          return {
            content: [{ type: 'text', text: `Error: Text "${oldText}" not found in file` }],
            isError: true,
          };
        }

        content = content.replace(oldText, newText);
        await fs.writeFile(filePath, content, 'utf-8');

        return {
          content: [{ type: 'text', text: `Successfully edited ${filePath}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error editing file: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // replace_lines tool - Replace specific lines in a file (like Claude Code)
  server.registerTool(
    'replace_lines',
    {
      description:
        'Replace a specific range of lines in a file by line numbers. IDEAL for precise edits when you know the exact line numbers. This is more efficient than write_file as it only changes the specified lines. Use this for targeted modifications.',
      inputSchema: z.object({
        path: z.string().describe('Path to the file to edit'),
        startLine: z.number().describe('Start line number (1-indexed)'),
        endLine: z.number().describe('End line number (inclusive, 1-indexed)'),
        newContent: z.string().describe('New content to replace the lines'),
      }),
    },
    async ({ path: filePath, startLine, endLine, newContent }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        const stats = await fs.stat(filePath);

        if (stats.size > maxFileSize) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: File too large (${stats.size} bytes, max ${maxFileSize} bytes)`,
              },
            ],
            isError: true,
          };
        }

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        // Validate line numbers
        if (startLine < 1 || startLine > lines.length) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: startLine ${startLine} is out of range (file has ${lines.length} lines)`,
              },
            ],
            isError: true,
          };
        }

        if (endLine < startLine || endLine > lines.length) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: endLine ${endLine} is invalid (must be >= ${startLine} and <= ${lines.length})`,
              },
            ],
            isError: true,
          };
        }

        // Show what will be replaced
        const oldLines = lines.slice(startLine - 1, endLine).join('\n');

        // Replace lines
        const before = lines.slice(0, startLine - 1);
        const after = lines.slice(endLine);
        const newLines = newContent.split('\n');

        const updatedLines = [...before, ...newLines, ...after];
        const updatedContent = updatedLines.join('\n');

        await fs.writeFile(filePath, updatedContent, 'utf-8');

        return {
          content: [
            {
              type: 'text',
              text: `Successfully replaced lines ${startLine}-${endLine} in ${filePath}\n\nOld content:\n${oldLines}\n\nNew content:\n${newContent}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error replacing lines: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // insert_lines tool - Insert lines at a specific position
  server.registerTool(
    'insert_lines',
    {
      description:
        'Insert new content at a specific line position in a file. EFFICIENT way to add content without rewriting the entire file. Use this to add imports, functions, or any new content at a specific location.',
      inputSchema: z.object({
        path: z.string().describe('Path to the file to edit'),
        afterLine: z
          .number()
          .describe('Line number after which to insert (0 = beginning, 1-indexed)'),
        content: z.string().describe('Content to insert'),
      }),
    },
    async ({ path: filePath, afterLine, content }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        const stats = await fs.stat(filePath);

        if (stats.size > maxFileSize) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: File too large (${stats.size} bytes, max ${maxFileSize} bytes)`,
              },
            ],
            isError: true,
          };
        }

        const fileContent = await fs.readFile(filePath, 'utf-8');
        const lines = fileContent.split('\n');

        // Validate line number
        if (afterLine < 0 || afterLine > lines.length) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: afterLine ${afterLine} is out of range (file has ${lines.length} lines)`,
              },
            ],
            isError: true,
          };
        }

        // Insert lines
        const before = lines.slice(0, afterLine);
        const after = lines.slice(afterLine);
        const newLines = content.split('\n');

        const updatedLines = [...before, ...newLines, ...after];
        const updatedContent = updatedLines.join('\n');

        await fs.writeFile(filePath, updatedContent, 'utf-8');

        return {
          content: [
            {
              type: 'text',
              text: `Successfully inserted ${newLines.length} line(s) after line ${afterLine} in ${filePath}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error inserting lines: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // delete_lines tool - Delete specific lines from a file
  server.registerTool(
    'delete_lines',
    {
      description:
        'Remove a specific range of lines from a file. EFFICIENT way to delete content without rewriting the entire file. Use this to remove unused code, comments, or any content by line numbers.',
      inputSchema: z.object({
        path: z.string().describe('Path to the file to edit'),
        startLine: z.number().describe('Start line number (1-indexed)'),
        endLine: z.number().describe('End line number (inclusive, 1-indexed)'),
      }),
    },
    async ({ path: filePath, startLine, endLine }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        const stats = await fs.stat(filePath);

        if (stats.size > maxFileSize) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: File too large (${stats.size} bytes, max ${maxFileSize} bytes)`,
              },
            ],
            isError: true,
          };
        }

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        // Validate line numbers
        if (startLine < 1 || startLine > lines.length) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: startLine ${startLine} is out of range (file has ${lines.length} lines)`,
              },
            ],
            isError: true,
          };
        }

        if (endLine < startLine || endLine > lines.length) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: endLine ${endLine} is invalid (must be >= ${startLine} and <= ${lines.length})`,
              },
            ],
            isError: true,
          };
        }

        // Show what will be deleted
        const deletedLines = lines.slice(startLine - 1, endLine).join('\n');

        // Delete lines
        const before = lines.slice(0, startLine - 1);
        const after = lines.slice(endLine);

        const updatedLines = [...before, ...after];
        const updatedContent = updatedLines.join('\n');

        await fs.writeFile(filePath, updatedContent, 'utf-8');

        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted lines ${startLine}-${endLine} from ${filePath}\n\nDeleted content:\n${deletedLines}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error deleting lines: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // create_directory tool - Create a directory
  server.registerTool(
    'create_directory',
    {
      description:
        'Create a new directory. Automatically creates parent directories if needed. USE THIS to organize project structure.',
      inputSchema: z.object({
        path: z.string().describe('Path to the directory to create'),
      }),
    },
    async ({ path: dirPath }) => {
      const validation = validator.validate(dirPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        await fs.mkdir(dirPath, { recursive: true });
        return {
          content: [{ type: 'text', text: `Successfully created directory ${dirPath}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error creating directory: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // delete_file tool - Delete a file
  server.registerTool(
    'delete_file',
    {
      description: 'Permanently delete a file. USE WITH CAUTION - this cannot be undone.',
      inputSchema: z.object({
        path: z.string().describe('Path to the file to delete'),
      }),
    },
    async ({ path: filePath }) => {
      const validation = validator.validate(filePath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        await fs.unlink(filePath);
        return {
          content: [{ type: 'text', text: `Successfully deleted ${filePath}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error deleting file: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // search_files tool - Search for text in files
  server.registerTool(
    'search_files',
    {
      description:
        'Search for text patterns across files using grep. MUCH FASTER than manually reading files. USE THIS to find where code or text is located.',
      inputSchema: z.object({
        pattern: z.string().describe('Text pattern to search for'),
        path: z.string().optional().describe('Directory to search in (default: current directory)'),
        filePattern: z.string().optional().describe('File pattern to match (e.g., "*.ts")'),
      }),
    },
    async ({ pattern, path: searchPath = '.', filePattern: _filePattern }) => {
      const validation = validator.validate(searchPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: validation.error! }],
          isError: true,
        };
      }

      try {
        const proc = spawn('grep', ['-r', '-n', '-i', pattern, searchPath], {
          timeout: 10000,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        return new Promise((resolve) => {
          proc.on('close', (code) => {
            if (code === 0) {
              resolve({
                content: [{ type: 'text', text: stdout || 'No matches found' }],
              });
            } else if (code === 1) {
              // grep returns 1 when no matches found
              resolve({
                content: [{ type: 'text', text: 'No matches found' }],
              });
            } else {
              resolve({
                content: [{ type: 'text', text: `Error: ${stderr}` }],
                isError: true,
              });
            }
          });

          proc.on('error', (error) => {
            resolve({
              content: [{ type: 'text', text: `Error: ${error.message}` }],
              isError: true,
            });
          });
        });
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error searching files: ${error}` }],
          isError: true,
        };
      }
    }
  );
}
