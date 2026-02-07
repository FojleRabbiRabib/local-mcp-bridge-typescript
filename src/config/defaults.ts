import { AgentConfig } from './types.js';
import path from 'path';
import os from 'os';

export const DEFAULT_CONFIG: AgentConfig = {
  allowedPaths: [process.cwd()],
  deniedPaths: [
    '/etc',
    '/sys',
    '/proc',
    '/dev',
    '/root',
    path.join(os.homedir(), '.ssh'),
    path.join(os.homedir(), '.aws'),
    path.join(os.homedir(), '.config'),
  ],
  allowedCommands: [
    'ls',
    'grep',
    'find',
    'cat',
    'head',
    'tail',
    'git',
    'npm',
    'node',
    'python',
    'python3',
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  enableCommandExecution: true,
  commandTimeout: 30000, // 30 seconds
};
