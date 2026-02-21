#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 * Validates that all required environment variables are set
 */

require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
require('dotenv').config(); // Also load .env

const requiredVars = {
  development: [
    'JWT_SECRET',
    'MUSIXMATCH_API_KEY'
  ],
  production: [
    'JWT_SECRET',
    'MONGODB_URI_PROD',
    'MUSIXMATCH_API_KEY',
    'SESSION_SECRET',
    'PRODUCTION_URL',
    'CLIENT_URL',
    'CORS_ORIGIN'
  ],
  test: [
    'JWT_SECRET'
  ]
};

const optionalVars = [
  'TWITTER_CONSUMER_KEY',
  'TWITTER_CONSUMER_SECRET',
  'INSTAGRAM_CLIENT_ID',
  'INSTAGRAM_CLIENT_SECRET',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'MONGODB_URI'
];

const env = process.env.NODE_ENV || 'development';
const required = requiredVars[env] || requiredVars.development;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateVariable(name) {
  const value = process.env[name];
  if (!value) {
    return { valid: false, error: 'Missing' };
  }

  // Validate JWT_SECRET length
  if (name === 'JWT_SECRET' && value.length < 64) {
    return { valid: false, error: 'Too short (minimum 64 characters)' };
  }

  // Validate URLs
  if (name.includes('URL') || name.includes('ORIGIN')) {
    try {
      new URL(value);
    } catch (e) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  // Validate MongoDB URI
  if (name === 'MONGODB_URI_PROD' && !value.startsWith('mongodb')) {
    return { valid: false, error: 'Invalid MongoDB URI format' };
  }

  return { valid: true };
}

log(`\n🔍 Validating Environment Variables for: ${env.toUpperCase()}\n`, 'cyan');
log('='.repeat(60), 'cyan');

let allValid = true;
const missing = [];
const invalid = [];

// Check required variables
log('\n📋 Required Variables:', 'yellow');
required.forEach(varName => {
  const result = validateVariable(varName);
  if (result.valid) {
    const value = process.env[varName];
    const preview = varName.includes('SECRET') || varName.includes('TOKEN') || varName.includes('PASSWORD')
      ? `${value.substring(0, 10)}...` 
      : value;
    log(`  ✅ ${varName}: ${preview}`, 'green');
  } else {
    log(`  ❌ ${varName}: ${result.error}`, 'red');
    allValid = false;
    if (result.error === 'Missing') {
      missing.push(varName);
    } else {
      invalid.push({ name: varName, error: result.error });
    }
  }
});

// Check optional variables
log('\n📋 Optional Variables:', 'yellow');
let optionalCount = 0;
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    const preview = varName.includes('SECRET') || varName.includes('KEY') || varName.includes('PASSWORD')
      ? `${value.substring(0, 10)}...`
      : value;
    log(`  ✅ ${varName}: ${preview}`, 'green');
    optionalCount++;
  } else {
    log(`  ⚠️  ${varName}: Not set (optional)`, 'yellow');
  }
});

// Summary
log('\n' + '='.repeat(60), 'cyan');
if (allValid) {
  log('\n✅ All required environment variables are valid!', 'green');
  log(`   Optional variables set: ${optionalCount}/${optionalVars.length}\n`, 'cyan');
  process.exit(0);
} else {
  log('\n❌ Environment validation failed!', 'red');
  
  if (missing.length > 0) {
    log('\nMissing variables:', 'red');
    missing.forEach(varName => {
      log(`  - ${varName}`, 'red');
    });
  }
  
  if (invalid.length > 0) {
    log('\nInvalid variables:', 'red');
    invalid.forEach(({ name, error }) => {
      log(`  - ${name}: ${error}`, 'red');
    });
  }
  
  log('\n💡 Tips:', 'yellow');
  log('  - Copy production.env.example to .env.production', 'yellow');
  log('  - Fill in all required values', 'yellow');
  log('  - Generate secrets: openssl rand -base64 64', 'yellow');
  log('  - See PRODUCTION_CHECKLIST.md for details\n', 'yellow');
  
  process.exit(1);
}
