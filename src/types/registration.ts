/**
 * Tool registration types for conditional tool exposure
 */

import { ProjectType } from '../detection/project-types.js';

/**
 * All tool categories available in the MCP Agent
 */
export enum ToolCategory {
  FILESYSTEM = 'filesystem',
  COMMANDS = 'commands',
  GIT = 'git',
  PROJECT = 'project',
  FORMATTING = 'formatting',
  PACKAGE_MANAGER = 'package-manager',
  TASKS = 'tasks',
  ML = 'ml',
  ANDROID = 'android',
  IMAGES = 'images',
  WEB = 'web',
}

/**
 * Tool configuration modes
 */
export type ToolMode = 'auto' | 'manual' | 'all';

/**
 * User overrides for tool exposure
 */
export interface ToolConfig {
  /** Detection mode */
  mode?: ToolMode;
  /** Explicit tool categories to enable (for manual mode) */
  enabled?: ToolCategory[];
  /** Tool categories to disable (for auto mode) */
  disabled?: ToolCategory[];
  /** Override auto-detection with specific project types */
  forceProjectTypes?: ProjectType[];
}

/**
 * Result of tool registration
 */
export interface RegistrationResult {
  /** Detected project types */
  detectedTypes: ProjectType[];
  /** Primary detected type */
  primaryType: ProjectType;
  /** Tool categories that were enabled */
  enabledTools: ToolCategory[];
  /** Tool categories that were disabled */
  disabledTools: ToolCategory[];
  /** Registration log messages */
  registrationLog: string[];
}

/**
 * Tool category to project types mapping
 */
export type ProjectToolMapping = Record<ProjectType, ToolCategory[]>;
