import { jest } from '@jest/globals';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Mock spawn result interface
 */
export interface MockSpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

/**
 * Creates a mock ChildProcess that behaves like a real spawn
 */
export function createMockChildProcess(result: MockSpawnResult, delay: number = 10): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as unknown as ChildProcess;
  proc.stderr = new EventEmitter() as unknown as ChildProcess;
  proc.stdin = new EventEmitter() as unknown as ChildProcess;

  // Simulate process output
  setTimeout(() => {
    if (result.stdout) {
      (proc.stdout as EventEmitter).emit('data', Buffer.from(result.stdout));
    }
    if (result.stderr) {
      (proc.stderr as EventEmitter).emit('data', Buffer.from(result.stderr));
    }
    proc.emit('close', result.exitCode);
  }, delay);

  return proc;
}

/**
 * Creates a mock spawn function that returns predefined results
 */
export function createMockSpawn(results: Map<string, MockSpawnResult> = new Map()): jest.Mock {
  return jest.fn((command: string, args: string[], options: Record<string, unknown> = {}) => {
    const key = `${command} ${args.join(' ')}`;
    const result = results.get(key);

    if (!result) {
      // Return a default "no output" result if not found
      return createMockChildProcess({ stdout: '', stderr: '', exitCode: 0 });
    }

    const proc = createMockChildProcess(result);

    // Handle timeout
    if (options.timeout && result.error?.includes('timeout')) {
      const timeout = options.timeout as number;
      setTimeout(() => {
        (proc as EventEmitter).emit('timeout');
        (proc as unknown as { kill: () => void }).kill();
      }, timeout + 10);
    }

    // Handle error
    if (result.error) {
      setTimeout(() => {
        (proc as EventEmitter).emit('error', new Error(result.error));
      }, 5);
    }

    return proc;
  });
}

/**
 * Common mock spawn results for git commands
 */
export const gitMockResults: Map<string, MockSpawnResult> = new Map([
  ['git status', { stdout: 'On branch main\nnothing to commit', stderr: '', exitCode: 0 }],
  ['git diff', { stdout: 'diff --git a/file.txt\n-index 123..456', stderr: '', exitCode: 0 }],
  ['git log', { stdout: 'commit abc123\nAuthor: Test\n\ncommit def456', stderr: '', exitCode: 0 }],
  ['git branch', { stdout: '* main\n  feature-branch', stderr: '', exitCode: 0 }],
  ['git add .', { stdout: '', stderr: '', exitCode: 0 }],
  ['git commit -m test', { stdout: '[main abc123] test', stderr: '', exitCode: 0 }],
  [
    'git show abc123',
    { stdout: 'commit abc123\nAuthor: Test\n\nfile content', stderr: '', exitCode: 0 },
  ],
]);

/**
 * Common mock spawn results for npm commands
 */
export const npmMockResults: Map<string, MockSpawnResult> = new Map([
  ['npm install', { stdout: 'added 123 packages', stderr: '', exitCode: 0 }],
  ['npm test', { stdout: 'PASS\nTests: 10 passed', stderr: '', exitCode: 0 }],
  ['npm run build', { stdout: 'Build complete', stderr: '', exitCode: 0 }],
  ['npm ls', { stdout: 'project@1.0.0', stderr: '', exitCode: 0 }],
  ['npm outdated', { stdout: 'Package  Current  Wanted  Latest', stderr: '', exitCode: 0 }],
]);

/**
 * Common mock spawn results for gradle commands
 */
export const gradleMockResults: Map<string, MockSpawnResult> = new Map([
  ['./gradlew build', { stdout: 'BUILD SUCCESSFUL', stderr: '', exitCode: 0 }],
  ['./gradlew tasks', { stdout: 'Available tasks:\n- build\n- test', stderr: '', exitCode: 0 }],
  [
    './gradlew assembleDebug',
    {
      stdout: 'BUILD SUCCESSFUL\napp/build/outputs/apk/debug/app-debug.apk',
      stderr: '',
      exitCode: 0,
    },
  ],
  ['./gradlew test', { stdout: 'Test execution finished', stderr: '', exitCode: 0 }],
  ['./gradlew lint', { stdout: 'Lint found 0 issues', stderr: '', exitCode: 0 }],
  ['./gradlew dependencies', { stdout: 'dependency tree...', stderr: '', exitCode: 0 }],
]);

/**
 * Common mock spawn results for python commands
 */
export const pythonMockResults: Map<string, MockSpawnResult> = new Map([
  ['python3 -c "print(\'hello\')"', { stdout: 'hello\n', stderr: '', exitCode: 0 }],
  ['python3 -m pip list', { stdout: 'package1 1.0.0\npackage2 2.0.0', stderr: '', exitCode: 0 }],
]);
