/**
 * Project type definitions for auto-detection
 *
 * Supports multiple project types per workspace (e.g., Laravel + React/Inertia)
 */

/**
 * All detectable project types
 */
export enum ProjectType {
  LARAVEL = 'laravel',
  REACT = 'react',
  VUE = 'vue',
  NEXTJS = 'nextjs',
  DJANGO = 'django',
  FLASK = 'flask',
  RAILS = 'rails',
  ANDROID = 'android',
  MAVEN = 'maven',
  GRADLE = 'gradle',
  GO = 'go',
  RUST = 'rust',
  NODE_JS = 'nodejs',
  PYTHON = 'python',
  PHP = 'php',
  RUBY = 'ruby',
  UNKNOWN = 'unknown',
}

/**
 * Result of project detection
 * Supports multiple project types for mixed projects (e.g., Laravel + React)
 */
export interface ProjectDetectionResult {
  /** All detected project types (can be multiple for mixed projects) */
  types: ProjectType[];
  /** Primary/most important project type */
  primaryType: ProjectType;
  /** Confidence scores for each detected type (0-1) - only includes detected types */
  confidence: Partial<Record<ProjectType, number>>;
  /** Raw analysis data for debugging */
  analysis: {
    language: string;
    framework: string;
    packageManager: string;
  };
}

/**
 * File indicators for project detection
 */
export interface ProjectFileIndicators {
  files: string[];
  packageJson?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  composerJson?: {
    require?: Record<string, string>;
  };
}
