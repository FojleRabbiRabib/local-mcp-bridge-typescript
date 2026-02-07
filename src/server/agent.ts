import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentConfig } from '../config/types.js';
import { PathValidator } from '../security/validator.js';
import { CommandValidator } from '../security/command-validator.js';
import { registerFileSystemTools } from '../tools/filesystem.js';
import { registerCommandTools } from '../tools/commands.js';
import { registerGitTools } from '../tools/git.js';
import { registerProjectTools } from '../tools/project.js';
import { registerFormattingTools } from '../tools/formatting.js';
import { registerPackageManagerTools } from '../tools/package-manager.js';
import { registerTaskTools } from '../tools/tasks.js';
import { registerMLTools } from '../tools/ml.js';

export function createAgentServer(config: AgentConfig): McpServer {
  const server = new McpServer(
    {
      name: 'mcp-agent',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  // Create validators
  const pathValidator = new PathValidator(config.allowedPaths, config.deniedPaths);
  const commandValidator = new CommandValidator(config.allowedCommands);

  // Register file system tools
  registerFileSystemTools(server, pathValidator, config.maxFileSize);

  // Register command execution tools if enabled
  if (config.enableCommandExecution) {
    registerCommandTools(server, commandValidator, pathValidator, config.commandTimeout);
  }

  // Register git tools
  registerGitTools(server, pathValidator, config.commandTimeout);

  // Register project analysis tools
  registerProjectTools(server, pathValidator);

  // Register code formatting and linting tools
  registerFormattingTools(server, pathValidator, config.commandTimeout);

  // Register package manager tools
  registerPackageManagerTools(server, pathValidator, config.commandTimeout);

  // Register task management tools
  registerTaskTools(server, pathValidator);

  // Register ML/AI tools
  registerMLTools(server, pathValidator, config.commandTimeout);

  return server;
}
