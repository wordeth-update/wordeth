# Test Suite Documentation

## Overview

This directory contains automated tests for the Wordeth platform using Jest and Supertest.

## Test Structure

```
tests/
├── setup.js          # Test configuration and setup
├── health.test.js    # Health check endpoint tests
├── auth.test.js      # Authentication API tests
├── articles.test.js  # Articles API tests
├── ads.test.js       # Advertising API tests
└── README.md         # This file
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Specific Test File
```bash
npm test -- auth.test.js
```

### Run with Coverage
```bash
npm test
# Coverage report will be generated automatically
```

## Test Environment

Tests run with:
- `NODE_ENV=test`
- Test database: `mongodb://localhost:27017/wordeth_test`
- Test JWT secret: `test-jwt-secret-key-for-testing-only`

## Adding New Tests

1. Create a new test file: `tests/feature.test.js`
2. Follow the existing test patterns
3. Use Supertest for HTTP endpoint testing
4. Mock external API calls when needed

## Example Test

```javascript
const request = require('supertest');
const app = require('../server');

describe('Feature Tests', () => {
  test('should do something', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);
    
    expect(response.body).toHaveProperty('data');
  });
});
```

## Coverage Goals

- Aim for >80% code coverage
- Focus on critical paths (auth, payments, data access)
- Test error cases and edge cases


