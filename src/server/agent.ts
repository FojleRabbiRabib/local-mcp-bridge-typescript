import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentConfig } from '../types/config.js';
import { PathValidator } from '../security/validator.js';
import { CommandValidator } from '../security/command-validator.js';
import { ConditionalToolRegistrar } from '../registration/conditional-registrar.js';

/**
 * Create an MCP Agent server with project-type-based tool exposure
 *
 * The server automatically detects the project type(s) in the workspace
 * and only registers relevant tools. For mixed projects (e.g., Laravel + React),
 * tools from all detected types are available.
 *
 * @param config - Agent configuration including workspace path and optional tool config
 * @returns Configured MCP server instance
 */
export async function createAgentServer(config: AgentConfig): Promise<McpServer> {
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

  // Create conditional tool registrar
  const registrar = new ConditionalToolRegistrar();

  // Register tools based on project detection and configuration
  await registrar.registerTools(server, config, pathValidator, commandValidator);

  return server;
}
