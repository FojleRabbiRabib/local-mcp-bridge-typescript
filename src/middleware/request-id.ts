import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use existing request ID or generate new one
  req.id = (req.headers['x-request-id'] as string) || randomUUID();

  // Add to response headers
  res.setHeader('X-Request-ID', req.id);

  next();
}
