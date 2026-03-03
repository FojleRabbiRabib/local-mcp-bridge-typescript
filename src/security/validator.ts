import path from 'path';

import { ValidationResult } from '../types/security.js';

export class PathValidator {
  constructor(
    private allowedPaths: string[],
    private deniedPaths: string[],
    private workspace: string
  ) {}

  validate(requestedPath: string): ValidationResult & { resolvedPath?: string } {
    try {
      // If path is relative, resolve it against the workspace
      const resolved = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(this.workspace, requestedPath);

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

      return { valid: true, resolvedPath: resolved };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid path: ${error}`,
      };
    }
  }
}
