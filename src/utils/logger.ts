import winston from 'winston';
import path from 'path';
import { env } from '../config/environment.js';

const isDevelopment = env.NODE_ENV !== 'production';

// Define custom log levels
const customLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

export const logger = winston.createLogger({
  levels: customLevels,
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json({
      space: 2,
      replacer: (key, value) => {
        if (value instanceof Error) {
          return {
            message: value.message,
            stack: value.stack,
            name: value.name,
          };
        }
        return value;
      },
    })
  ),
  defaultMeta: {
    service: 'mcp-bridge',
    environment: env.NODE_ENV,
    version: '1.0.0',
  },
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: env.LOG_FILE_MAX_SIZE,
      maxFiles: env.LOG_FILE_MAX_FILES,
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: env.LOG_FILE_MAX_SIZE,
      maxFiles: env.LOG_FILE_MAX_FILES,
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
} else {
  // In production, add console transport with JSON format
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
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
          cause: error.cause,
        },
        ...context,
      };
    }
    return {
      error: String(error),
      ...context,
    };
  },

  request: (requestId: string, method: string, path: string, statusCode?: number) => ({
    requestId,
    method,
    path,
    statusCode,
  }),

  metric: (name: string, value: number, tags: Record<string, string> = {}) => ({
    metric: name,
    value,
    tags,
    timestamp: new Date().toISOString(),
  }),
};

// Logging utility functions
export const logWithContext = {
  info: (message: string, context: Record<string, unknown> = {}) => {
    logger.info(message, context);
  },

  error: (message: string, error?: Error, context: Record<string, unknown> = {}) => {
    if (error) {
      logger.error(message, logContext.error(error, context));
    } else {
      logger.error(message, context);
    }
  },

  warn: (message: string, context: Record<string, unknown> = {}) => {
    logger.warn(message, context);
  },

  debug: (message: string, context: Record<string, unknown> = {}) => {
    logger.debug(message, context);
  },
};
