import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs/promises';
import path from 'path';
import { PathValidator } from '../security/validator.js';
import * as z from 'zod';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  created: string;
  updated: string;
  dueDate?: string;
}

export function registerTaskTools(server: McpServer, validator: PathValidator) {
  // create_task tool - Create a new task
  server.registerTool(
    'create_task',
    {
      description: 'Create a new task/todo item',
      inputSchema: z.object({
        path: z.string().describe('Project path'),
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('Task priority'),
        tags: z.array(z.string()).optional().describe('Task tags'),
        dueDate: z.string().optional().describe('Due date (ISO format)'),
      }),
    },
    async ({ path: projectPath, title, description, priority = 'medium', tags = [], dueDate }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const tasks = await loadTasks(projectPath);
        const newTask: Task = {
          id: generateId(),
          title,
          description,
          status: 'todo',
          priority,
          tags,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          dueDate,
        };

        tasks.push(newTask);
        await saveTasks(projectPath, tasks);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Task created successfully!\nID: ${newTask.id}\nTitle: ${newTask.title}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error creating task: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // list_tasks tool - List all tasks
  server.registerTool(
    'list_tasks',
    {
      description: 'List all tasks/todos',
      inputSchema: z.object({
        path: z.string().describe('Project path'),
        status: z
          .enum(['todo', 'in-progress', 'done', 'all'])
          .optional()
          .describe('Filter by status'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority'),
        tag: z.string().optional().describe('Filter by tag'),
      }),
    },
    async ({ path: projectPath, status = 'all', priority, tag }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        let tasks = await loadTasks(projectPath);

        // Apply filters
        if (status !== 'all') {
          tasks = tasks.filter((t) => t.status === status);
        }
        if (priority) {
          tasks = tasks.filter((t) => t.priority === priority);
        }
        if (tag) {
          tasks = tasks.filter((t) => t.tags.includes(tag));
        }

        if (tasks.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No tasks found' }],
          };
        }

        const formatted = tasks
          .map(
            (t) =>
              `[${t.id}] ${t.status === 'done' ? '✓' : t.status === 'in-progress' ? '⟳' : '○'} ${t.title}\n` +
              `  Priority: ${t.priority} | Status: ${t.status}\n` +
              (t.description ? `  ${t.description}\n` : '') +
              (t.tags.length > 0 ? `  Tags: ${t.tags.join(', ')}\n` : '') +
              (t.dueDate ? `  Due: ${t.dueDate}\n` : '')
          )
          .join('\n');

        return {
          content: [{ type: 'text' as const, text: formatted }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error listing tasks: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // update_task tool - Update task status/details
  server.registerTool(
    'update_task',
    {
      description: 'Update a task',
      inputSchema: z.object({
        path: z.string().describe('Project path'),
        id: z.string().describe('Task ID'),
        status: z.enum(['todo', 'in-progress', 'done']).optional().describe('New status'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
      }),
    },
    async ({ path: projectPath, id, status, priority, title, description }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const tasks = await loadTasks(projectPath);
        const taskIndex = tasks.findIndex((t) => t.id === id);

        if (taskIndex === -1) {
          return {
            content: [{ type: 'text' as const, text: `Task not found: ${id}` }],
            isError: true,
          };
        }

        const task = tasks[taskIndex];
        if (status) task.status = status;
        if (priority) task.priority = priority;
        if (title) task.title = title;
        if (description !== undefined) task.description = description;
        task.updated = new Date().toISOString();

        await saveTasks(projectPath, tasks);

        return {
          content: [{ type: 'text' as const, text: `Task updated successfully: ${task.title}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error updating task: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // delete_task tool - Delete a task
  server.registerTool(
    'delete_task',
    {
      description: 'Delete a task',
      inputSchema: z.object({
        path: z.string().describe('Project path'),
        id: z.string().describe('Task ID'),
      }),
    },
    async ({ path: projectPath, id }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const tasks = await loadTasks(projectPath);
        const taskIndex = tasks.findIndex((t) => t.id === id);

        if (taskIndex === -1) {
          return {
            content: [{ type: 'text' as const, text: `Task not found: ${id}` }],
            isError: true,
          };
        }

        const deletedTask = tasks.splice(taskIndex, 1)[0];
        await saveTasks(projectPath, tasks);

        return {
          content: [{ type: 'text' as const, text: `Task deleted: ${deletedTask.title}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error deleting task: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // search_todos tool - Search for TODO/FIXME comments in code
  server.registerTool(
    'search_todos',
    {
      description: 'Search for TODO, FIXME, HACK, NOTE comments in code',
      inputSchema: z.object({
        path: z.string().describe('Project path'),
        type: z
          .enum(['TODO', 'FIXME', 'HACK', 'NOTE', 'all'])
          .optional()
          .describe('Comment type to search for'),
      }),
    },
    async ({ path: projectPath, type = 'all' }) => {
      const validation = validator.validate(projectPath);
      if (!validation.valid) {
        return {
          content: [{ type: 'text' as const, text: validation.error! }],
          isError: true,
        };
      }

      try {
        const pattern = type === 'all' ? 'TODO|FIXME|HACK|NOTE' : type;
        const { spawn } = await import('child_process');

        return new Promise((resolve) => {
          const proc = spawn('grep', ['-rn', '-E', `(${pattern}):`, projectPath], {
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

          proc.on('close', (code) => {
            if (code === 0) {
              resolve({
                content: [{ type: 'text' as const, text: stdout || 'No TODOs found' }],
              });
            } else if (code === 1) {
              resolve({
                content: [{ type: 'text' as const, text: 'No TODOs found' }],
              });
            } else {
              resolve({
                content: [{ type: 'text' as const, text: `Error: ${stderr}` }],
                isError: true,
              });
            }
          });

          proc.on('error', (error) => {
            resolve({
              content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
              isError: true,
            });
          });
        });
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error searching TODOs: ${error}` }],
          isError: true,
        };
      }
    }
  );
}

// Helper: Load tasks from .mcp-tasks.json
async function loadTasks(projectPath: string): Promise<Task[]> {
  const tasksFile = path.join(projectPath, '.mcp-tasks.json');
  try {
    const content = await fs.readFile(tasksFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// Helper: Save tasks to .mcp-tasks.json
async function saveTasks(projectPath: string, tasks: Task[]): Promise<void> {
  const tasksFile = path.join(projectPath, '.mcp-tasks.json');
  await fs.writeFile(tasksFile, JSON.stringify(tasks, null, 2), 'utf-8');
}

// Helper: Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
