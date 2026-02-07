import path from 'path';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class PathValidator {
  constructor(
    private allowedPaths: string[],
    private deniedPaths: string[]
  ) {}

  validate(requestedPath: string): ValidationResult {
    try {
      // Resolve to absolute path to prevent path traversal
      const resolved = path.resolve(requestedPath);

      // Check denied paths first (highest priority)
      for (const denied of this.deniedPaths) {
        const deniedResolved = path.resolve(denied);
        if (resolved.startsWith(deniedResolved)) {
          return {
            valid: false,
            error: `Access denied: Path is in restricted directory '${denied}'`,
          };
        }
      }

      // Check allowed paths
      let allowed = false;
      for (const allowedPath of this.allowedPaths) {
        const allowedResolved = path.resolve(allowedPath);
        if (resolved.startsWith(allowedResolved)) {
          allowed = true;
          break;
        }
      }

      if (!allowed) {
        return {
          valid: false,
          error: `Access denied: Path is not in allowed directories. Allowed: ${this.allowedPaths.join(', ')}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid path: ${error}`,
      };
    }
  }
}
