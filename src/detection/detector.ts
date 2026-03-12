/**
 * Project type detector
 *
 * Analyzes workspace files to detect project types.
 * Supports multiple types per workspace for mixed projects.
 */

import fs from 'fs/promises';
import path from 'path';
import { ProjectType, ProjectDetectionResult, ProjectFileIndicators } from './project-types.js';

export class ProjectDetector {
  /**
   * Detect project type(s) from workspace path
   */
  async detect(projectPath: string): Promise<ProjectDetectionResult> {
    const types: ProjectType[] = [];
    const confidence: Partial<Record<ProjectType, number>> = {};

    const analysis = {
      language: 'unknown',
      framework: 'unknown',
      packageManager: 'unknown',
    };

    try {
      const files = await fs.readdir(projectPath);
      const indicators = await this.getFileIndicators(projectPath, files);

      // Detect Node.js projects
      const nodeTypes = this.detectNodeTypes(files, indicators);
      if (nodeTypes.length > 0) {
        types.push(...nodeTypes);
        nodeTypes.forEach((t) => (confidence[t] = 0.9));
        analysis.language = 'JavaScript/TypeScript';
        analysis.packageManager = this.detectPackageManager(files);
      }

      // Detect Python projects
      const pythonTypes = this.detectPythonTypes(files);
      if (pythonTypes.length > 0) {
        types.push(...pythonTypes);
        pythonTypes.forEach((t) => (confidence[t] = 0.9));
        analysis.language = 'Python';
      }

      // Detect PHP projects
      const phpTypes = this.detectPhpTypes(files);
      if (phpTypes.length > 0) {
        types.push(...phpTypes);
        phpTypes.forEach((t) => (confidence[t] = 0.95));
        analysis.language = 'PHP';
      }

      // Detect Ruby projects
      const rubyTypes = this.detectRubyTypes(files);
      if (rubyTypes.length > 0) {
        types.push(...rubyTypes);
        rubyTypes.forEach((t) => (confidence[t] = 0.9));
        analysis.language = 'Ruby';
      }

      // Detect Java projects
      const javaTypes = this.detectJavaTypes(files);
      if (javaTypes.length > 0) {
        types.push(...javaTypes);
        javaTypes.forEach((t) => (confidence[t] = 0.9));
        analysis.language = javaTypes.includes(ProjectType.ANDROID) ? 'Kotlin/Java' : 'Java';
      }

      // Detect Go projects
      if (this.detectGo(files)) {
        types.push(ProjectType.GO);
        confidence[ProjectType.GO] = 0.95;
        analysis.language = 'Go';
      }

      // Detect Rust projects
      if (this.detectRust(files)) {
        types.push(ProjectType.RUST);
        confidence[ProjectType.RUST] = 0.95;
        analysis.language = 'Rust';
      }

      // Remove duplicates
      const uniqueTypes = [...new Set(types)];

      // Determine framework from detected types
      // Order matters: more specific frameworks should be checked first
      if (uniqueTypes.includes(ProjectType.LARAVEL)) {
        analysis.framework = 'Laravel';
      } else if (uniqueTypes.includes(ProjectType.NEXTJS)) {
        analysis.framework = 'Next.js';
      } else if (uniqueTypes.includes(ProjectType.REACT)) {
        analysis.framework = 'React';
      } else if (uniqueTypes.includes(ProjectType.VUE)) {
        analysis.framework = 'Vue';
      } else if (uniqueTypes.includes(ProjectType.DJANGO)) {
        analysis.framework = 'Django';
      } else if (uniqueTypes.includes(ProjectType.FLASK)) {
        analysis.framework = 'Flask';
      } else if (uniqueTypes.includes(ProjectType.RAILS)) {
        analysis.framework = 'Rails';
      } else if (uniqueTypes.includes(ProjectType.ANDROID)) {
        analysis.framework = 'Android/Gradle';
      } else if (uniqueTypes.includes(ProjectType.MAVEN)) {
        analysis.framework = 'Maven';
      } else if (uniqueTypes.includes(ProjectType.GRADLE)) {
        analysis.framework = 'Gradle';
      }

      return {
        types: uniqueTypes.length > 0 ? uniqueTypes : [ProjectType.UNKNOWN],
        primaryType: uniqueTypes.length > 0 ? uniqueTypes[0] : ProjectType.UNKNOWN,
        confidence,
        analysis,
      };
    } catch {
      return {
        types: [ProjectType.UNKNOWN],
        primaryType: ProjectType.UNKNOWN,
        confidence: { [ProjectType.UNKNOWN]: 0 },
        analysis,
      };
    }
  }

  /**
   * Get file indicators including parsed package.json, composer.json
   */
  private async getFileIndicators(
    projectPath: string,
    files: string[]
  ): Promise<ProjectFileIndicators> {
    const indicators: ProjectFileIndicators = { files };

    // Parse package.json if present
    if (files.includes('package.json')) {
      try {
        const packageJsonContent = await fs.readFile(
          path.join(projectPath, 'package.json'),
          'utf-8'
        );
        indicators.packageJson = JSON.parse(packageJsonContent);
      } catch {
        // Ignore parse errors
      }
    }

    // Parse composer.json if present
    if (files.includes('composer.json')) {
      try {
        const composerJsonContent = await fs.readFile(
          path.join(projectPath, 'composer.json'),
          'utf-8'
        );
        indicators.composerJson = JSON.parse(composerJsonContent);
      } catch {
        // Ignore parse errors
      }
    }

    return indicators;
  }

  /**
   * Detect Node.js-based project types
   */
  private detectNodeTypes(files: string[], indicators: ProjectFileIndicators): ProjectType[] {
    const types: ProjectType[] = [];

    if (!indicators.packageJson) {
      return types;
    }

    const deps = {
      ...indicators.packageJson.dependencies,
      ...indicators.packageJson.devDependencies,
    };

    // Check for Next.js first (also a React project, but more specific)
    if (deps.next) {
      types.push(ProjectType.NEXTJS);
    }

    // Check for React
    if (deps.react) {
      types.push(ProjectType.REACT);
    }

    // Check for Vue
    if (deps.vue) {
      types.push(ProjectType.VUE);
    }

    // Generic Node.js if no specific framework detected
    if (types.length === 0) {
      types.push(ProjectType.NODE_JS);
    }

    return types;
  }

  /**
   * Detect Python-based project types
   */
  private detectPythonTypes(files: string[]): ProjectType[] {
    const types: ProjectType[] = [];

    const hasPythonConfig =
      files.includes('requirements.txt') ||
      files.includes('setup.py') ||
      files.includes('pyproject.toml');

    if (!hasPythonConfig) {
      return types;
    }

    // Check for Django
    if (files.includes('manage.py')) {
      types.push(ProjectType.DJANGO);
    }
    // Check for Flask
    else if (files.includes('app.py') || files.includes('wsgi.py')) {
      types.push(ProjectType.FLASK);
    }
    // Generic Python
    else {
      types.push(ProjectType.PYTHON);
    }

    return types;
  }

  /**
   * Detect PHP-based project types
   */
  private detectPhpTypes(files: string[]): ProjectType[] {
    const types: ProjectType[] = [];

    if (!files.includes('composer.json')) {
      return types;
    }

    // Check for Laravel
    if (files.includes('artisan')) {
      types.push(ProjectType.LARAVEL);
    } else {
      types.push(ProjectType.PHP);
    }

    return types;
  }

  /**
   * Detect Ruby-based project types
   */
  private detectRubyTypes(files: string[]): ProjectType[] {
    const types: ProjectType[] = [];

    if (!files.includes('Gemfile')) {
      return types;
    }

    // Check for Rails
    if (files.includes('config.ru')) {
      types.push(ProjectType.RAILS);
    } else {
      types.push(ProjectType.RUBY);
    }

    return types;
  }

  /**
   * Detect Java-based project types
   */
  private detectJavaTypes(files: string[]): ProjectType[] {
    const types: ProjectType[] = [];

    // Check for Android
    const hasGradlew =
      files.includes('gradlew') ||
      files.includes('gradlew.bat') ||
      files.includes('build.gradle') ||
      files.includes('build.gradle.kts');

    const isAndroid =
      hasGradlew &&
      (files.includes('settings.gradle') ||
        files.includes('settings.gradle.kts') ||
        files.includes('AndroidManifest.xml'));

    if (isAndroid) {
      types.push(ProjectType.ANDROID);
    }

    // Check for Maven (non-Android)
    if (files.includes('pom.xml') && !isAndroid) {
      types.push(ProjectType.MAVEN);
    }

    // Check for Gradle (non-Android)
    if (files.includes('build.gradle') && !isAndroid && !types.includes(ProjectType.MAVEN)) {
      types.push(ProjectType.GRADLE);
    }

    return types;
  }

  /**
   * Detect Go projects
   */
  private detectGo(files: string[]): boolean {
    return files.includes('go.mod');
  }

  /**
   * Detect Rust projects
   */
  private detectRust(files: string[]): boolean {
    return files.includes('Cargo.toml');
  }

  /**
   * Detect package manager from lock files
   */
  private detectPackageManager(files: string[]): string {
    if (files.includes('package-lock.json')) {
      return 'npm';
    }
    if (files.includes('yarn.lock')) {
      return 'yarn';
    }
    if (files.includes('pnpm-lock.yaml')) {
      return 'pnpm';
    }
    return 'npm';
  }
}
