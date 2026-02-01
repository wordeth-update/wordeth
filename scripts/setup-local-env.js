#!/usr/bin/env node
/**
 * Local Environment Setup Script
 * Configures .env file for local testing
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Generate secure random secret
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('base64');
}

// Read .env file
const envPath = path.join(__dirname, '..', '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
} else {
  // Create from template
  const templatePath = path.join(__dirname, '..', 'env.example');
  if (fs.existsSync(templatePath)) {
    envContent = fs.readFileSync(templatePath, 'utf8');
  } else {
    console.error('❌ env.example not found');
    process.exit(1);
  }
}

// Update or add required variables
const updates = {
  'SESSION_SECRET': generateSecret(64),
  'JWT_SECRET': envContent.match(/JWT_SECRET=(.+)/)?.[1] || generateSecret(64),
  'NODE_ENV': 'development',
  'PORT': '3000',
  'CLIENT_URL': 'http://localhost:3000',
  'CORS_ORIGIN': 'http://localhost:3000',
};

// Update each variable
Object.keys(updates).forEach(key => {
  const value = updates[key];
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    // Add if not exists
    envContent += `\n${key}=${value}\n`;
  }
});

// Write updated content
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('✅ Local environment configured!');
console.log('📋 Updated variables:');
Object.keys(updates).forEach(key => {
  if (key.includes('SECRET') || key.includes('TOKEN')) {
    console.log(`   ${key}: [HIDDEN]`);
  } else {
    console.log(`   ${key}: ${updates[key]}`);
  }
});
