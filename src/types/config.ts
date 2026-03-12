import { ToolConfig } from './registration.js';

export interface ServerConfig {
  name: string;
  port: number;
  host: string;
}

export interface AgentConfig {
  allowedPaths: string[];
  deniedPaths: string[];
  allowedCommands: string[];
  /** Additional commands to append to the default allowedCommands list.
   * Unlike allowedCommands which replaces defaults, this adds to them.
   * If both allowedCommands and additionalAllowedCommands are set,
   * allowedCommands takes precedence (it replaces entirely). */
  additionalAllowedCommands?: string[];
  maxFileSize: number;
  enableCommandExecution: boolean;
  commandTimeout: number;
  workspace: string;
  /** Tool exposure configuration */
  tools?: ToolConfig;
}

export interface ConfigFile {
  version: string;
  server?: ServerConfig;
  permissions?: Partial<AgentConfig>;
  limits?: {
    maxFileSize?: number;
    commandTimeout?: number;
  };
  /** Tool configuration at config file level */
  tools?: ToolConfig;
}
