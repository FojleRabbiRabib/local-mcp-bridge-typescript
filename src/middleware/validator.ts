import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

// Validation schemas
export const schemas = {
  sseQuery: z.object({
    command: z.string().min(1).max(100),
    args: z.string().optional(),
    cwd: z.string().optional(),
  }),

  agentQuery: z.object({
    workspace: z.string().min(1),
  }),

  sessionQuery: z.object({
    sessionId: z.string().min(1),
  }),

  jsonrpcBody: z.object({
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
    id: z.union([z.string(), z.number()]).optional(),
  }),
};

// Validation middleware factory
export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      if (!result.success) {
        logger.warn('Query validation failed', {
          errors: result.error.issues,
          query: req.query,
          path: req.path,
        });

        return res.status(400).json({
          error: 'Validation failed',
          details: result.error.issues.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        logger.warn('Body validation failed', {
          errors: result.error.issues,
          path: req.path,
        });

        return res.status(400).json({
          error: 'Validation failed',
          details: result.error.issues.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Sanitize input to prevent injection
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/['"]/g, '') // Remove quotes
    .trim();
}
