import { ValidationResult } from '../types/security.js';

export class CommandValidator {
  constructor(private allowedCommands: string[]) {}

  validate(command: string): ValidationResult {
    if (!this.allowedCommands.includes(command)) {
      return {
        valid: false,
        error: `Command '${command}' is not allowed. Allowed commands: ${this.allowedCommands.join(', ')}`,
      };
    }
    return { valid: true };
  }
}
