export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, true, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, true);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Not authorized') {
    super(message, 403, true);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, true);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, true);
    this.name = 'RateLimitError';
  }
}

export class SessionError extends AppError {
  constructor(message: string = 'Session error') {
    super(message, 400, true);
    this.name = 'SessionError';
  }
}

export class CommandError extends AppError {
  constructor(
    command: string,
    details?: Record<string, unknown>,
    message: string = 'Command execution failed'
  ) {
    super(message, 500, true, { command, ...details });
    this.name = 'CommandError';
  }
}

export class TransportError extends AppError {
  constructor(
    transportType: string,
    details?: Record<string, unknown>,
    message: string = 'Transport error'
  ) {
    super(message, 500, true, { transportType, ...details });
    this.name = 'TransportError';
  }
}

// Error handler middleware
export function errorHandler(
  err: Error,
  req: { id?: string },
  res: { status: (code: number) => { json: (data: unknown) => void }; headersSent: boolean },
  next: (err: Error) => void
) {
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.name,
        statusCode: err.statusCode,
        details: err.details,
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);

  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'InternalServerError',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    },
  });
}

// Async error wrapper for Express routes
export function asyncHandler(
  fn: (req: unknown, res: unknown, next: (err: Error) => void) => Promise<void>
) {
  return (req: unknown, res: unknown, next: (err: Error) => void) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Error boundary for process-level errors
export function setupErrorBoundary() {
  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    // Perform cleanup if needed
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Perform cleanup if needed
    process.exit(1);
  });
}
