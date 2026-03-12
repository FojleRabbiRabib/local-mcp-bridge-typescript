/**
 * Conditional tool registrar
 *
 * Registers tools based on detected project types and user configuration.
 * Handles mixed projects by taking the union of tools from all detected types.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PathValidator } from '../security/validator.js';
import { CommandValidator } from '../security/command-validator.js';
import { ProjectDetector } from '../detection/detector.js';
import { ProjectType, ProjectDetectionResult } from '../detection/project-types.js';
import { ToolCategory, ToolConfig, ToolMode, RegistrationResult } from '../types/registration.js';
import { getToolsForProjectTypes, UNIVERSAL_TOOLS } from './tool-registry.js';
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
import { registerWebTools } from '../tools/web.js';
import { logger } from '../utils/logger.js';

/**
 * Agent configuration interface with tool config
 */
export interface AgentConfigWithTools {
  allowedPaths: string[];
  deniedPaths: string[];
  allowedCommands: string[];
  additionalAllowedCommands?: string[];
  maxFileSize: number;
  enableCommandExecution: boolean;
  commandTimeout: number;
  workspace: string;
  tools?: ToolConfig;
}

/**
 * Conditional tool registrar
 */
export class ConditionalToolRegistrar {
  private detector: ProjectDetector;

  constructor() {
    this.detector = new ProjectDetector();
  }

  /**
   * Register tools based on project detection and configuration
   */
  async registerTools(
    server: McpServer,
    config: AgentConfigWithTools,
    pathValidator: PathValidator,
    commandValidator: CommandValidator
  ): Promise<RegistrationResult> {
    const log: string[] = [];
    const toolConfig = config.tools || {};

    // Determine mode (default: auto with fallback to all)
    const mode: ToolMode = toolConfig.mode || 'auto';
    log.push(`Tool mode: ${mode}`);

    let detectedTypes: ProjectType[] = [];
    let primaryType: ProjectType = ProjectType.UNKNOWN;

    // Detect project types or use forced types
    if (toolConfig.forceProjectTypes && toolConfig.forceProjectTypes.length > 0) {
      detectedTypes = toolConfig.forceProjectTypes;
      primaryType = detectedTypes[0];
      log.push(`Forced project types: ${detectedTypes.join(', ')}`);
    } else if (mode === 'auto') {
      const detection: ProjectDetectionResult = await this.detector.detect(config.workspace);
      detectedTypes = detection.types;
      primaryType = detection.primaryType;
      log.push(
        `Detected: ${detectedTypes.join(', ')} (primary: ${primaryType}, language: ${detection.analysis.language}, framework: ${detection.analysis.framework})`
      );
    }

    // Determine which tools to enable
    let enabledTools: ToolCategory[] = [];
    const allTools: ToolCategory[] = Object.values(ToolCategory);

    switch (mode) {
      case 'all':
        // Enable all tools
        enabledTools = allTools;
        log.push('Mode: all tools enabled');
        break;

      case 'manual':
        // Use explicitly enabled tools, or universal tools as fallback
        enabledTools = toolConfig.enabled || UNIVERSAL_TOOLS;
        log.push(`Mode: manual, tools: ${enabledTools.join(', ')}`);
        break;

      case 'auto':
      default:
        // Get tools based on detected project types
        if (detectedTypes.length === 0 || detectedTypes.includes(ProjectType.UNKNOWN)) {
          // Fallback to universal tools if detection fails
          enabledTools = UNIVERSAL_TOOLS;
          log.push('Detection failed, using universal tools only');
        } else {
          enabledTools = getToolsForProjectTypes(detectedTypes);
          log.push(`Auto-selected tools: ${enabledTools.join(', ')}`);
        }
        break;
    }

    // Apply disabled filter
    if (toolConfig.disabled && toolConfig.disabled.length > 0) {
      const beforeCount = enabledTools.length;
      enabledTools = enabledTools.filter((t) => !toolConfig.disabled!.includes(t));
      if (enabledTools.length !== beforeCount) {
        log.push(`Disabled tools: ${toolConfig.disabled.join(', ')}`);
      }
    }

    // Always include commands tool if enableCommandExecution is true
    if (config.enableCommandExecution && !enabledTools.includes(ToolCategory.COMMANDS)) {
      enabledTools.push(ToolCategory.COMMANDS);
      log.push('Added COMMANDS tool (enableCommandExecution=true)');
    }

    // Get the list of tools that are available but not enabled
    const disabledTools = allTools.filter((t) => !enabledTools.includes(t));

    // Register each enabled tool category
    for (const category of enabledTools) {
      await this.registerToolCategory(
        server,
        category,
        config,
        pathValidator,
        commandValidator,
        detectedTypes,
        mode
      );
      log.push(`Registered: ${category}`);
    }

    logger.info('Tool registration complete', {
      mode,
      detectedTypes,
      enabledTools,
      disabledTools,
    });

    return {
      detectedTypes,
      primaryType,
      enabledTools,
      disabledTools,
      registrationLog: log,
    };
  }

  /**
   * Register a single tool category
   */
  private async registerToolCategory(
    server: McpServer,
    category: ToolCategory,
    config: AgentConfigWithTools,
    pathValidator: PathValidator,
    commandValidator: CommandValidator,
    detectedTypes: ProjectType[],
    mode: ToolMode
  ): Promise<void> {
    switch (category) {
      case ToolCategory.FILESYSTEM:
        registerFileSystemTools(
          server,
          pathValidator,
          config.maxFileSize,
          config.workspace,
          config.commandTimeout
        );
        break;

      case ToolCategory.COMMANDS:
        if (config.enableCommandExecution) {
          registerCommandTools(
            server,
            commandValidator,
            pathValidator,
            config.commandTimeout,
            config.workspace
          );
        }
        break;

      case ToolCategory.GIT:
        registerGitTools(server, pathValidator, config.commandTimeout, config.workspace);
        break;

      case ToolCategory.PROJECT:
        registerProjectTools(server, pathValidator, config.workspace);
        break;

      case ToolCategory.FORMATTING:
        registerFormattingTools(
          server,
          pathValidator,
          config.commandTimeout,
          config.workspace,
          mode === 'all' ? undefined : detectedTypes
        );
        break;

      case ToolCategory.PACKAGE_MANAGER:
        registerPackageManagerTools(
          server,
          pathValidator,
          config.commandTimeout,
          config.workspace,
          mode === 'all' ? undefined : detectedTypes
        );
        break;

      case ToolCategory.TASKS:
        registerTaskTools(server, pathValidator, config.workspace);
        break;

      case ToolCategory.ML:
        registerMLTools(
          server,
          pathValidator,
          config.commandTimeout,
          config.workspace,
          mode === 'all' ? undefined : detectedTypes
        );
        break;

      case ToolCategory.ANDROID:
        registerAndroidTools(
          server,
          pathValidator,
          config.commandTimeout,
          config.workspace,
          mode === 'all' ? undefined : detectedTypes
        );
        break;

      case ToolCategory.IMAGES:
        registerImageTools(server, pathValidator);
        break;

      case ToolCategory.WEB:
        registerWebTools(server);
        break;
    }
  }
}
