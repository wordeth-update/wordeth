#!/usr/bin/env node

require('dotenv').config();

console.log('🔍 Testing Wordeth Server Configuration...\n');

// Check required environment variables
const requiredVars = [
    'JWT_SECRET',
    'MONGODB_URI_PROD',
    'GENIUS_ACCESS_TOKEN'
];

const optionalVars = [
    'TWITTER_CONSUMER_KEY',
    'TWITTER_CONSUMER_SECRET',
    'INSTAGRAM_CLIENT_ID',
    'INSTAGRAM_CLIENT_SECRET',
    'FACEBOOK_APP_ID',
    'FACEBOOK_APP_SECRET'
];

console.log('📋 Required Environment Variables:');
let allRequiredPresent = true;

requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
    } else {
        console.log(`❌ ${varName}: MISSING`);
        allRequiredPresent = false;
    }
});

console.log('\n📋 Optional Environment Variables (Social Auth):');
optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
    } else {
        console.log(`⚠️  ${varName}: Not set (social auth will be disabled)`);
    }
});

console.log('\n🔧 Testing Server Startup...');

if (!allRequiredPresent) {
    console.log('\n❌ Missing required environment variables. Please check your .env file.');
    console.log('📖 See API_KEYS_REFERENCE.md for setup instructions.');
    process.exit(1);
}

// Test server startup
try {
    const app = require('./server');
    console.log('\n✅ Server configuration looks good!');
    console.log('🚀 You can now run: npm start');
} catch (error) {
    console.log('\n❌ Server configuration error:');
    console.log(error.message);
    process.exit(1);
}
