import { PathValidator } from '../security/validator.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

type MockServer = {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    handler: (...args: unknown[]) => Promise<unknown>
  ) => void;
  capturedHandlers: Map<string, (...args: unknown[]) => Promise<unknown>>;
};

/**
 * Test environment setup
 */
export interface TestEnv {
  tempDir: string;
  validator: PathValidator;
  workspace: string;
}

/**
 * Creates a test environment with a temporary directory
 */
export async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  const validator = new PathValidator([tempDir], [], tempDir);
  return { tempDir, validator, workspace: tempDir };
}

/**
 * Cleans up a test environment
 */
export async function cleanupTestEnv(env: TestEnv): Promise<void> {
  await fs.rm(env.tempDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Creates a mock server that captures tool handlers
 */
export function createMockServer(): MockServer {
  const capturedHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  return {
    registerTool: (
      name: string,
      _config: Record<string, unknown>,
      handler: (...args: unknown[]) => Promise<unknown>
    ) => {
      capturedHandlers.set(name, handler);
    },
    capturedHandlers,
  };
}

/**
 * Captures tool handlers from a tool registration function
 */
export function captureToolHandlers(
  registerFn: (server: MockServer, ...args: unknown[]) => void,
  ...args: unknown[]
): Map<string, unknown> {
  const mockServer = createMockServer();
  registerFn(mockServer, ...args);
  return mockServer.capturedHandlers;
}

/**
 * Creates test files in a directory
 */
export async function createTestFiles(dir: string, files: Record<string, string>): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    const dirPath = path.dirname(fullPath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(fullPath, content);
  }
}

/**
 * Creates a mock spawn with custom results
 */
export function setupMockSpawn(
  _results: Map<
    string,
    { stdout: string; stderr: string; exitCode: number; error?: string }
  > = new Map()
): jest.Mock {
  return jest.fn((_command: string, _args: string[], _options: Record<string, unknown> = {}) => {
    const proc = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 5);
        }
        return proc;
      }),
      kill: jest.fn(),
    };

    setTimeout(() => {
      if (proc.stdout.on) {
        proc.stdout.on.mock.calls[0]?.[1]('mock output');
      }
    }, 5);

    return proc;
  });
}

/**
 * Asserts that a tool result is successful
 */
export function expectSuccess(result: {
  isError?: boolean;
  content: Array<{ text: string }>;
}): void {
  expect(result).toBeDefined();
  expect(result.isError).not.toBe(true);
  expect(result.content).toBeDefined();
  expect(result.content.length).toBeGreaterThan(0);
}

/**
 * Asserts that a tool result is an error
 */
export function expectError(
  result: { isError?: boolean; content: Array<{ text: string }> },
  errorMessage?: string
): void {
  expect(result).toBeDefined();
  expect(result.isError).toBe(true);
  if (errorMessage) {
    expect(result.content[0].text).toContain(errorMessage);
  }
}

/**
 * Asserts that result content contains text
 */
export function expectContains(
  result: { isError?: boolean; content: Array<{ text: string }> },
  text: string
): void {
  expectSuccess(result);
  expect(result.content[0].text).toContain(text);
}

/**
 * Creates a delayed promise for testing timeouts
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Common test file content
 */
export const testFileContent = {
  typescript: `
interface User {
  id: number;
  name: string;
}

export function getUser(id: number): User | null {
  return null;
}

export class UserService {
  private users: Map<number, User> = new Map();

  find(id: number): User | undefined {
    return this.users.get(id);
  }
}
`,
  javascript: `
function greet(name) {
  return \`Hello, \${name}!\`;
}

const result = greet("World");
console.log(result);
`,
  java: `
package com.example;

import java.util.List;

public class TestClass {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
`,
  python: `
def greet(name: str) -> str:
    return f"Hello, {name}!"

if __name__ == "__main__":
    print(greet("World"))
`,
  json: `
{
  "name": "test-project",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0"
  }
}
`,
  markdown: `
# Test Project

## Overview

This is a test project.

## Features

- Feature 1
- Feature 2

## Usage

\`\`\`bash
npm install
npm start
\`\`\`
`,
};

/**
 * Creates a .gitignore file
 */
export async function createGitignore(
  dir: string,
  content = 'node_modules/\ndist/\n.env\n'
): Promise<void> {
  await fs.writeFile(path.join(dir, '.gitignore'), content);
}

/**
 * Creates a package.json file
 */
export async function createPackageJson(
  dir: string,
  content: Record<string, unknown> = { name: 'test-project', version: '1.0.0' }
): Promise<void> {
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

/**
 * Creates a tsconfig.json file
 */
export async function createTsConfig(dir: string): Promise<void> {
  await fs.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          strict: true,
        },
      },
      null,
      2
    )
  );
}
