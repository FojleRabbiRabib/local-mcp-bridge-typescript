import winston from 'winston';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-bridge' },
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 10485760,
      maxFiles: 10,
    }),
  ],
});

// Console logging in development
if (isDevelopment) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    })
  );
}

// Helper functions for structured logging
export const logContext = {
  session: (sessionId: string, data: Record<string, unknown> = {}) => ({
    sessionId,
    ...data,
  }),

  tool: (toolName: string, duration?: number, data: Record<string, unknown> = {}) => ({
    tool: toolName,
    duration,
    ...data,
  }),

  error: (error: Error | unknown, context: Record<string, unknown> = {}) => {
    if (error instanceof Error) {
      return {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        ...context,
      };
    }
    return {
      error: String(error),
      ...context,
    };
  },
};
