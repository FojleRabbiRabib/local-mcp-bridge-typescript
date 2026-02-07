// Test setup file
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set up global test configurations
beforeAll(() => {
  // Global setup if needed
});

afterAll(() => {
  // Global teardown if needed
});

// Extend global type
declare global {
  var sleep: (ms: number) => Promise<void>;
}

// Global test helpers
global.sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
