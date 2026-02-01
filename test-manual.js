#!/usr/bin/env node

/**
 * Manual API Testing Script
 * 
 * This script provides a quick way to test API endpoints manually.
 * Usage: node test-manual.js [endpoint] [method] [data]
 * 
 * Examples:
 *   node test-manual.js /api/health GET
 *   node test-manual.js /api/articles/featured GET
 *   node test-manual.js /api/auth/signup POST '{"name":"Test","email":"test@example.com","password":"password123"}'
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(endpoint, method = 'GET', data = null, token = null) {
  try {
    const url = `${BASE_URL}${endpoint}`;
    const config = {
      method: method.toLowerCase(),
      url: url,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (data) {
      config.data = typeof data === 'string' ? JSON.parse(data) : data;
    }

    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`Testing: ${method} ${endpoint}`, 'blue');
    log(`${'='.repeat(60)}`, 'cyan');

    const startTime = Date.now();
    const response = await axios(config);
    const duration = Date.now() - startTime;

    log(`\n✅ Status: ${response.status} ${response.statusText}`, 'green');
    log(`⏱️  Duration: ${duration}ms`, 'cyan');
    log(`\n📦 Response:`, 'yellow');
    console.log(JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    if (error.response) {
      log(`\n❌ Error: ${error.response.status} ${error.response.statusText}`, 'red');
      log(`\n📦 Response:`, 'yellow');
      console.log(JSON.stringify(error.response.data, null, 2));
    } else {
      log(`\n❌ Error: ${error.message}`, 'red');
    }
    return null;
  }
}

// Quick test functions
async function quickTests() {
  log('\n🚀 Running Quick Test Suite...\n', 'cyan');

  // 1. Health check
  await testEndpoint('/api/health', 'GET');
  await new Promise(resolve => setTimeout(resolve, 500));

  // 2. Featured articles
  await testEndpoint('/api/articles/featured', 'GET');
  await new Promise(resolve => setTimeout(resolve, 500));

  // 3. Ad inventory
  await testEndpoint('/api/ads/inventory', 'GET');
  await new Promise(resolve => setTimeout(resolve, 500));

  // 4. Sign up test user
  const testUser = {
    name: 'Manual Test User',
    email: `manualtest${Date.now()}@example.com`,
    password: 'password123'
  };
  const signupResult = await testEndpoint('/api/auth/signup', 'POST', testUser);
  
  if (signupResult && signupResult.token) {
    const token = signupResult.token;
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. Get user profile
    await testEndpoint('/api/user/profile', 'GET', null, token);
    await new Promise(resolve => setTimeout(resolve, 500));

    // 6. Add search history
    await testEndpoint('/api/user/history', 'POST', {
      songTitle: 'Test Song',
      artist: 'Test Artist'
    }, token);
  }

  log('\n✅ Quick test suite complete!\n', 'green');
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  // No arguments, run quick tests
  quickTests();
} else if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  log('\n📖 Wordeth API Manual Testing Tool\n', 'cyan');
  log('Usage:', 'yellow');
  log('  node test-manual.js                           # Run quick test suite');
  log('  node test-manual.js [endpoint] [method] [data] # Test specific endpoint');
  log('\nExamples:', 'yellow');
  log('  node test-manual.js /api/health GET');
  log('  node test-manual.js /api/articles/featured GET');
  log('  node test-manual.js /api/auth/signup POST \'{"name":"Test","email":"test@example.com","password":"pass123"}\'');
  log('\nEnvironment Variables:', 'yellow');
  log('  TEST_URL - Base URL for API (default: http://localhost:3000)');
  log('\n');
} else {
  const endpoint = args[0];
  const method = args[1] || 'GET';
  const data = args[2] || null;
  testEndpoint(endpoint, method, data);
}


