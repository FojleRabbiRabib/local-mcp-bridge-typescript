import { AgentConfig } from '../types/config.js';
import path from 'path';
import os from 'os';

export const DEFAULT_CONFIG: Omit<AgentConfig, 'workspace'> = {
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
    'python3',
    'python3.7',
    'python3.8',
    'python3.10',
    'python3.11',
    'python3.12',
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  enableCommandExecution: true,
  commandTimeout: 30000, // 30 seconds
};
