import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  jitter?: boolean;
  timeout?: number;
  retryOn?: (error: Error) => boolean;
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private consecutiveSuccesses = 0;

  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 30000, // 30 seconds
    private halfOpenSuccessThreshold: number = 3
  ) {}

  async execute<T>(fn: () => Promise<T>, operationName: string = 'operation'): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.debug('Circuit breaker transitioning to HALF_OPEN', { operationName });
      } else {
        logger.warn('Circuit breaker is OPEN, rejecting request', { operationName });
        throw new CircuitBreakerError(`Circuit breaker is OPEN for ${operationName}`);
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      logger.error('Circuit breaker recorded failure', {
        operationName,
        error: error instanceof Error ? error.message : String(error),
        state: this.state,
        failures: this.failures,
      });
      throw error;
    }
  }

  private recordSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.halfOpenSuccessThreshold) {
        this.state = 'CLOSED';
        this.consecutiveSuccesses = 0;
        logger.info('Circuit breaker reset to CLOSED');
      }
    }
  }

  private recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.consecutiveSuccesses = 0;
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn('Circuit breaker opened due to failure threshold', {
        failures: this.failures,
        threshold: this.failureThreshold,
      });
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  operationName: string = 'operation'
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    maxDelay = 10000,
    backoffFactor = 2,
    jitter = true,
    timeout,
    retryOn = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (timeout) {
        return await withTimeout(fn(), timeout, operationName);
      }
      return await fn();
    } catch (error) {
      lastError = error;

      // If it's a TimeoutError, throw it directly without wrapping
      if (error instanceof TimeoutError) {
        throw error;
      }

      // Check if we should retry
      if (error instanceof Error && !retryOn(error)) {
        break;
      }
      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff and optional jitter
      let delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);

      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5); // Add ±25% jitter
      }

      logger.warn(`Retrying ${operationName} after error`, {
        attempt,
        maxAttempts,
        delay: Math.round(delay),
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // If last error was TimeoutError, throw it directly
  if (lastError instanceof TimeoutError) {
    throw lastError;
  }

  const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error';
  throw new RetryableError(
    `Failed after ${maxAttempts} attempts: ${errorMessage}`,
    lastError instanceof Error ? lastError : undefined
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

// Default circuit breaker instances
export const commandCircuitBreaker = new CircuitBreaker(3, 60000, 2);
export const transportCircuitBreaker = new CircuitBreaker(5, 30000, 3);
export const sessionCircuitBreaker = new CircuitBreaker(2, 120000, 1);
