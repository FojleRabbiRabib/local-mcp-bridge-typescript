import fs from 'fs/promises';
import path from 'path';
import ignore from 'ignore';

export interface IgnoreResult {
  isIgnored: (filePath: string) => boolean;
}

interface NestedIgnore {
  relativeDir: string;
  content: string;
}

// Directories to skip during .gitignore traversal (for performance)
const SKIP_TRAVERSE_DIRS = new Set([
  'node_modules',
  '.git',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  'bin',
  'obj',
]);

/**
 * Load .gitignore from the project root and all nested .gitignore files
 * This properly handles Laravel and other frameworks that use nested .gitignore files
 */
export async function loadIgnoreFiles(projectRoot: string): Promise<IgnoreResult> {
  const ig = ignore();

  // Always ignore .git
  ig.add('.git');

  // Load root .gitignore
  try {
    const rootGitignore = path.join(projectRoot, '.gitignore');
    const content = await fs.readFile(rootGitignore, 'utf-8');
    ig.add(content);
  } catch {
    // Root .gitignore doesn't exist
  }

  // Recursively find and load all nested .gitignore files
  const nestedIgnores = await findNestedGitignores(projectRoot);
  for (const { relativeDir, content } of nestedIgnores) {
    // Prepend the relative directory to each pattern to make it relative to project root
    // For example: storage/framework/views/.gitignore with "*.php" becomes "storage/framework/views/*.php"
    const patterns = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')) // Skip empty lines and comments
      .map((line) => {
        // Handle negation patterns (lines starting with !)
        if (line.startsWith('!')) {
          return `!${path.posix.join(relativeDir, line.slice(1))}`;
        }
        // Handle directory patterns (ending with /)
        if (line.endsWith('/')) {
          return path.posix.join(relativeDir, line.slice(0, -1)) + '/';
        }
        // Regular patterns
        return path.posix.join(relativeDir, line);
      });

    if (patterns.length > 0) {
      ig.add(patterns);
    }
  }

  return {
    isIgnored: (filePath: string) => {
      // ignore library expects paths relative to the root
      // Handle both absolute and relative paths
      let relativePath: string;
      if (path.isAbsolute(filePath)) {
        relativePath = path.relative(projectRoot, filePath);
      } else {
        // Already relative, use as-is
        relativePath = filePath;
      }
      if (!relativePath) return false;

      // Normalize path separators for cross-platform compatibility
      const normalizedPath = relativePath.split(path.sep).join(path.posix.sep);
      return ig.ignores(normalizedPath);
    },
  };
}

/**
 * Recursively find all .gitignore files in the project directory
 */
async function findNestedGitignores(
  dirPath: string,
  basePath: string = dirPath,
  results: NestedIgnore[] = []
): Promise<NestedIgnore[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip known large directories to improve performance
        if (SKIP_TRAVERSE_DIRS.has(entry.name)) {
          continue;
        }
        await findNestedGitignores(fullPath, basePath, results);
      } else if (entry.name === '.gitignore') {
        // Skip the root .gitignore (already loaded above)
        if (fullPath === path.join(basePath, '.gitignore')) {
          continue;
        }
        const relativeDir = path.relative(basePath, path.dirname(fullPath));
        const content = await fs.readFile(fullPath, 'utf-8');
        results.push({ relativeDir, content });
      }
    }

    return results;
  } catch {
    return results;
  }
}
