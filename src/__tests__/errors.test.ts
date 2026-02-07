import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  SessionError,
  CommandError,
  TransportError,
  errorHandler,
  asyncHandler,
} from '../utils/errors.js';

describe('Error Handling', () => {
  describe('Custom Error Classes', () => {
    it('should create AppError with default values', () => {
      const error = new AppError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should create AppError with custom values', () => {
      const details = { field: 'test' };
      const error = new AppError('Test error', 400, false, details);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(false);
      expect(error.details).toEqual(details);
    });

    it('should create ValidationError', () => {
      const details = { field: 'email', reason: 'invalid' };
      const error = new ValidationError('Validation failed', details);
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
      expect(error.details).toEqual(details);
    });

    it('should create AuthenticationError', () => {
      const error = new AuthenticationError('Invalid credentials');
      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
    });

    it('should create AuthorizationError', () => {
      const error = new AuthorizationError('Insufficient permissions');
      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('AuthorizationError');
    });

    it('should create NotFoundError', () => {
      const error = new NotFoundError('User');
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
    });

    it('should create RateLimitError', () => {
      const error = new RateLimitError('Too many requests');
      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.name).toBe('RateLimitError');
    });

    it('should create SessionError', () => {
      const error = new SessionError('Session expired');
      expect(error.message).toBe('Session expired');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('SessionError');
    });

    it('should create CommandError with details', () => {
      const details = { exitCode: 1 };
      const error = new CommandError('npm', details, 'Installation failed');
      expect(error.message).toBe('Installation failed');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('CommandError');
      expect(error.details).toEqual({ command: 'npm', exitCode: 1 });
    });

    it('should create TransportError', () => {
      const details = { reason: 'connection lost' };
      const error = new TransportError('SSE', details, 'Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('TransportError');
      expect(error.details).toEqual({ transportType: 'SSE', reason: 'connection lost' });
    });
  });

  describe('Error Handler Middleware', () => {
    let mockReq: { id: string; path: string };
    let mockRes: { status: jest.Mock; json: jest.Mock; headersSent: boolean };
    let mockNext: jest.Mock;

    beforeEach(() => {
      mockReq = {
        id: 'test-request-id',
        path: '/test',
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      };
      mockNext = jest.fn();
    });

    it('should handle AppError correctly', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Invalid input',
          code: 'ValidationError',
          statusCode: 400,
          details: { field: 'email' },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });

    it('should handle generic Error', () => {
      const error = new Error('Generic error');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Internal server error',
          code: 'InternalServerError',
          statusCode: 500,
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        },
      });
    });

    it('should call next if headers already sent', () => {
      mockRes.headersSent = true;
      const error = new Error('Test error');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('Async Handler', () => {
    it('should catch async errors and pass to next', async () => {
      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const handler = asyncHandler(asyncFn);

      const mockReq = {};
      const mockRes = {};
      const mockNext = jest.fn();

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should not call next when async function succeeds', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const handler = asyncHandler(asyncFn);

      const mockReq = {};
      const mockRes = {};
      const mockNext = jest.fn();

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
