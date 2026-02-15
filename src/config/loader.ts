import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DEFAULT_CONFIG } from './defaults.js';
import { AgentConfig, ConfigFile } from './types.js';

/**
 * Load configuration from global and workspace-specific config files
 * Priority: workspace config > global config > defaults
 */
export async function loadConfig(workspace?: string): Promise<AgentConfig> {
  let config = { ...DEFAULT_CONFIG };

  // Load global config from ~/.mcp-agent.json
  const globalConfigPath = path.join(os.homedir(), '.mcp-agent.json');
  const globalConfig = await loadConfigFile(globalConfigPath);
  if (globalConfig) {
    config = mergeConfig(config, globalConfig);
  }

  // Load workspace-specific config if workspace is provided
  if (workspace) {
    const resolvedWorkspace = path.resolve(workspace);
    const workspaceConfigPath = path.join(resolvedWorkspace, '.mcp-agent.json');
    const workspaceConfig = await loadConfigFile(workspaceConfigPath);
    if (workspaceConfig) {
      config = mergeConfig(config, workspaceConfig);
    }

    // Ensure workspace is always in allowedPaths
    // Normalize existing allowed paths for comparison
    const normalizedAllowedPaths = config.allowedPaths.map((p) =>
      p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : path.resolve(p)
    );

    if (!normalizedAllowedPaths.includes(resolvedWorkspace)) {
      config.allowedPaths.push(resolvedWorkspace);
    }
  }

  // Expand home directory in paths
  config.allowedPaths = config.allowedPaths.map(expandHome);
  config.deniedPaths = config.deniedPaths.map(expandHome);

  return config;
}

async function loadConfigFile(filePath: string): Promise<Partial<AgentConfig> | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const configFile: ConfigFile = JSON.parse(content);

    const config: Partial<AgentConfig> = {};

    if (configFile.permissions) {
      Object.assign(config, configFile.permissions);
    }

    if (configFile.limits) {
      if (configFile.limits.maxFileSize !== undefined) {
        config.maxFileSize = configFile.limits.maxFileSize;
      }
      if (configFile.limits.commandTimeout !== undefined) {
        config.commandTimeout = configFile.limits.commandTimeout;
      }
    }

    return config;
  } catch {
    // Config file doesn't exist or is invalid - that's okay
    return null;
  }
}

function mergeConfig(base: AgentConfig, override: Partial<AgentConfig>): AgentConfig {
  return {
    ...base,
    ...override,
  };
}

function expandHome(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}
