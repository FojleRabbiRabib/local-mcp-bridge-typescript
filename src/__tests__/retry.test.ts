import {
  retry,
  CircuitBreaker,
  RetryableError,
  CircuitBreakerError,
  TimeoutError,
  commandCircuitBreaker,
} from '../utils/retry.js';

describe('Retry Logic', () => {
  describe('retry function', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await retry(mockFn, { maxAttempts: 3 }, 'testOperation');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await retry(mockFn, { maxAttempts: 3 }, 'testOperation');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max attempts', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(retry(mockFn, { maxAttempts: 3 }, 'testOperation')).rejects.toThrow(
        RetryableError
      );
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should respect retryOn predicate', async () => {
      const temporaryError = new Error('Temporary');
      const permanentError = new Error('Permanent');

      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(temporaryError)
        .mockRejectedValueOnce(permanentError);

      const retryOn = (error: Error) => error.message === 'Temporary';

      await expect(retry(mockFn, { maxAttempts: 3, retryOn }, 'testOperation')).rejects.toThrow(
        'Permanent'
      );
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should apply exponential backoff with jitter', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      const startTime = Date.now();

      try {
        await retry(mockFn, { maxAttempts: 3, baseDelay: 100, backoffFactor: 2 }, 'testOperation');
      } catch {
        // Expected to fail after 3 attempts
      }

      const elapsed = Date.now() - startTime;
      // With jitter, the delay could be as low as 75% of expected: 100 + 150 = 250ms minimum
      // Account for some timing variance
      expect(elapsed).toBeGreaterThan(200);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should timeout if operation takes too long', async () => {
      const mockFn = () => new Promise((resolve) => setTimeout(() => resolve('slow'), 200));

      await expect(retry(mockFn, { timeout: 100 }, 'testOperation')).rejects.toThrow(TimeoutError);
    });
  });

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(2, 1000, 1); // 2 failures threshold, 1s reset, 1 success to close
    });

    it('should start in CLOSED state', () => {
      const state = circuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failures).toBe(0);
    });

    it('should open after failure threshold', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('Failure'));

      // First failure
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      expect(circuitBreaker.getState().state).toBe('CLOSED');

      // Second failure - should open
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      expect(circuitBreaker.getState().state).toBe('OPEN');
    });

    it('should reject requests when OPEN', async () => {
      // Open the circuit breaker
      const failingFn = jest.fn().mockRejectedValue(new Error('Failure'));
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');

      // Now try to execute - should be rejected immediately
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow(CircuitBreakerError);
      expect(failingFn).toHaveBeenCalledTimes(2); // Only called twice, not three times
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Open the circuit
      const failingFn = jest.fn().mockRejectedValue(new Error('Failure'));
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');

      // Wait for reset timeout (1 second + buffer)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Try to execute - this should trigger transition to HALF_OPEN
      // The circuit breaker transitions from OPEN to HALF_OPEN when execute() is called after timeout
      // Then since the function succeeds, it transitions to CLOSED
      const successFn = jest.fn().mockResolvedValue('success');
      await expect(circuitBreaker.execute(successFn, 'test')).resolves.toBe('success');

      // Should now be CLOSED (since halfOpenSuccessThreshold is 1 and we had a success)
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should close after successful execution in HALF_OPEN', async () => {
      // Open then wait for timeout
      const failingFn = jest.fn().mockRejectedValue(new Error('Failure'));
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Successful execution in HALF_OPEN (transitions to CLOSED)
      const successFn = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(successFn, 'test');

      expect(result).toBe('success');
      expect(circuitBreaker.getState().state).toBe('CLOSED');
      expect(circuitBreaker.getState().failures).toBe(0);
    });

    it('should open again if failure occurs in HALF_OPEN', async () => {
      // Open then wait for timeout
      const failingFn = jest.fn().mockRejectedValue(new Error('Failure'));
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Another failure in HALF_OPEN
      await expect(circuitBreaker.execute(failingFn, 'test')).rejects.toThrow('Failure');
      expect(circuitBreaker.getState().state).toBe('OPEN');
    });
  });

  describe('Default circuit breakers', () => {
    it('should have default circuit breaker instances', () => {
      expect(commandCircuitBreaker).toBeInstanceOf(CircuitBreaker);
      expect(commandCircuitBreaker.getState().state).toBe('CLOSED');
    });
  });
});
