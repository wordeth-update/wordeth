/**
 * Test setup and utilities
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-64-characters-long-minimum';
process.env.MONGODB_URI = 'mongodb://localhost:27017/wordeth_test'; // Will use demo mode if not available
process.env.MONGODB_URI_PROD = ''; // Clear production URI for tests
process.env.GENIUS_ACCESS_TOKEN = 'test-genius-token';
process.env.PORT = '3001'; // Use different port for tests

// Mock console methods to reduce noise in tests (keep errors visible)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // warn: jest.fn(), // Keep warnings for debugging
  // error: jest.fn(), // Keep errors for debugging
};

// Test timeout for async operations
jest.setTimeout(30000);

// Mock mongoose connection for tests without DB
beforeAll(async () => {
  // Tests will run in demo mode if MongoDB is not available
  // This is expected and acceptable for testing
});

// Clean up after all tests
afterAll(async () => {
  // Close any open connections
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});


