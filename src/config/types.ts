export interface AgentConfig {
  allowedPaths: string[];
  deniedPaths: string[];
  allowedCommands: string[];
  maxFileSize: number;
  enableCommandExecution: boolean;
  commandTimeout: number;
}

export interface ServerConfig {
  name: string;
  port: number;
  host: string;
}

export interface ConfigFile {
  version: string;
  server?: ServerConfig;
  permissions?: Partial<AgentConfig>;
  limits?: {
    maxFileSize?: number;
    commandTimeout?: number;
  };
}
