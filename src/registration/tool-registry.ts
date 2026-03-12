/**
 * Tool registry mapping project types to tool categories
 *
 * Defines which tools should be exposed for each project type.
 * Universal tools (filesystem, git, project, tasks, images, web) are always enabled.
 */

import { ProjectType } from '../detection/project-types.js';
import { ToolCategory, ProjectToolMapping } from '../types/registration.js';

/**
 * Universal tools that are always enabled regardless of project type
 */
export const UNIVERSAL_TOOLS: ToolCategory[] = [
  ToolCategory.FILESYSTEM,
  ToolCategory.GIT,
  ToolCategory.PROJECT,
  ToolCategory.TASKS,
  ToolCategory.IMAGES,
  ToolCategory.WEB,
];

/**
 * Mapping of project types to their specialized tool categories
 *
 * These are ADDITIONAL tools beyond universal tools.
 * For mixed projects, tools are combined (union).
 */
export const PROJECT_TOOL_MAPPING: ProjectToolMapping = {
  // PHP Projects
  [ProjectType.LARAVEL]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],
  [ProjectType.PHP]: [ToolCategory.PACKAGE_MANAGER],

  // JavaScript/TypeScript Projects
  [ProjectType.REACT]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],
  [ProjectType.VUE]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],
  [ProjectType.NEXTJS]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],
  [ProjectType.NODE_JS]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],

  // Python Projects
  [ProjectType.DJANGO]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING, ToolCategory.ML],
  [ProjectType.FLASK]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING, ToolCategory.ML],
  [ProjectType.PYTHON]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING, ToolCategory.ML],

  // Ruby Projects
  [ProjectType.RAILS]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],
  [ProjectType.RUBY]: [ToolCategory.PACKAGE_MANAGER],

  // Java Projects
  [ProjectType.ANDROID]: [
    ToolCategory.ANDROID,
    ToolCategory.PACKAGE_MANAGER,
    ToolCategory.FORMATTING,
  ],
  [ProjectType.MAVEN]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],
  [ProjectType.GRADLE]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],

  // Go Projects
  [ProjectType.GO]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],

  // Rust Projects
  [ProjectType.RUST]: [ToolCategory.PACKAGE_MANAGER, ToolCategory.FORMATTING],

  // Unknown - no specialized tools
  [ProjectType.UNKNOWN]: [],
};

/**
 * Get all tool categories for given project types
 * Combines universal tools with specialized tools for each detected type
 */
export function getToolsForProjectTypes(types: ProjectType[]): ToolCategory[] {
  const tools = new Set(UNIVERSAL_TOOLS);

  for (const type of types) {
    const typeTools = PROJECT_TOOL_MAPPING[type] || [];
    typeTools.forEach((tool) => tools.add(tool));
  }

  return Array.from(tools);
}

/**
 * Check if a tool category is universal (always enabled)
 */
export function isUniversalTool(category: ToolCategory): boolean {
  return UNIVERSAL_TOOLS.includes(category);
}
