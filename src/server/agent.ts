import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentConfig } from '../types/config.js';
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
import { registerAndroidTools } from '../tools/android.js';
import { registerImageTools } from '../tools/images.js';

export function createAgentServer(config: AgentConfig): McpServer {
  // Validate workspace is provided and valid
  if (!config.workspace || config.workspace.trim() === '') {
    throw new Error(
      'Workspace is required. Provide a valid workspace path when creating the agent server.'
    );
  }

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
  const pathValidator = new PathValidator(
    config.allowedPaths,
    config.deniedPaths,
    config.workspace
  );
  const commandValidator = new CommandValidator(config.allowedCommands);

  // Register file system tools
  registerFileSystemTools(
    server,
    pathValidator,
    config.maxFileSize,
    config.workspace,
    config.commandTimeout
  );

  // Register command execution tools if enabled
  if (config.enableCommandExecution) {
    registerCommandTools(
      server,
      commandValidator,
      pathValidator,
      config.commandTimeout,
      config.workspace
    );
  }

  // Register git tools
  registerGitTools(server, pathValidator, config.commandTimeout, config.workspace);

  // Register project analysis tools
  registerProjectTools(server, pathValidator, config.workspace);

  // Register code formatting and linting tools
  registerFormattingTools(server, pathValidator, config.commandTimeout, config.workspace);

  // Register package manager tools
  registerPackageManagerTools(server, pathValidator, config.commandTimeout, config.workspace);

  // Register task management tools
  registerTaskTools(server, pathValidator, config.workspace);

  // Register ML/AI tools
  registerMLTools(server, pathValidator, config.commandTimeout, config.workspace);

  // Register Android development tools
  registerAndroidTools(server, pathValidator, config.commandTimeout, config.workspace);

  // Register image reading tools
  registerImageTools(server, pathValidator);

  return server;
}
