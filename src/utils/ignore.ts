import fs from 'fs/promises';
import path from 'path';
import ignore from 'ignore';

export interface IgnoreResult {
  isIgnored: (filePath: string) => boolean;
}

/**
 * Load .gitignore from the project root and return an Ignore instance
 */
export async function loadIgnoreFiles(projectRoot: string): Promise<IgnoreResult> {
  const ig = ignore();

  // Always ignore .git
  ig.add('.git');

  try {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(content);
  } catch {
    // .gitignore doesn't exist - just return .git ignore
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
      return ig.ignores(relativePath);
    },
  };
}
