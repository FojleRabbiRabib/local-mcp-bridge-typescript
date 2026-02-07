import { validateEnv } from '../config/environment.js';

describe('Environment Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should validate default environment variables', () => {
    // Clear environment for default test
    process.env = {};

    const env = validateEnv();
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('localhost');
    expect(env.ALLOWED_COMMANDS).toEqual([
      'php',
      'python',
      'python3',
      'node',
      'npx',
      'uvx',
      'deno',
    ]);
    expect(env.SESSION_TIMEOUT).toBe(3600000);
    expect(env.MAX_SESSIONS).toBe(100);
  });

  it('should parse custom environment variables', () => {
    process.env.PORT = '8080';
    process.env.HOST = '0.0.0.0';
    process.env.ALLOWED_COMMANDS = 'node,npm';
    process.env.SESSION_TIMEOUT = '600000';
    process.env.MAX_SESSIONS = '50';
    process.env.LOG_LEVEL = 'debug';
    process.env.NODE_ENV = 'production';

    const env = validateEnv();
    expect(env.PORT).toBe(8080);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.ALLOWED_COMMANDS).toEqual(['node', 'npm']);
    expect(env.SESSION_TIMEOUT).toBe(600000);
    expect(env.MAX_SESSIONS).toBe(50);
    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.NODE_ENV).toBe('production');
  });

  it('should handle boolean string for METRICS_ENABLED', () => {
    process.env.METRICS_ENABLED = 'false';
    const env = validateEnv();
    expect(env.METRICS_ENABLED).toBe(false);

    process.env.METRICS_ENABLED = 'true';
    const env2 = validateEnv();
    expect(env2.METRICS_ENABLED).toBe(true);
  });

  it('should throw error for invalid NODE_ENV', () => {
    process.env.NODE_ENV = 'invalid';

    // Mock console.error to prevent test output
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    expect(() => validateEnv()).toThrow('process.exit');

    consoleError.mockRestore();
    exitSpy.mockRestore();
  });

  it('should throw error for invalid LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'invalid';

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    expect(() => validateEnv()).toThrow('process.exit');

    consoleError.mockRestore();
    exitSpy.mockRestore();
  });

  it('should parse number strings correctly', () => {
    process.env.PORT = '1234';
    process.env.SESSION_TIMEOUT = '7200000';
    process.env.MAX_SESSIONS = '200';
    process.env.LOG_FILE_MAX_SIZE = '20971520';

    const env = validateEnv();
    expect(env.PORT).toBe(1234);
    expect(env.SESSION_TIMEOUT).toBe(7200000);
    expect(env.MAX_SESSIONS).toBe(200);
    expect(env.LOG_FILE_MAX_SIZE).toBe(20971520);
  });
});
