#!/usr/bin/env node

/**
 * Simple Server Start Script
 * Runs the server and opens browser automatically
 */

const { spawn } = require('child_process');
const http = require('http');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const MAX_STARTUP_WAIT = 30000; // 30 seconds

console.log('🚀 Starting Wordeth Server...\n');

// Start the server
const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_ENV: 'development' }
});

// Check if server is ready
function checkServerReady(attempts = 0) {
  const maxAttempts = MAX_STARTUP_WAIT / 1000;
  
  if (attempts > maxAttempts) {
    console.log('\n❌ Server took too long to start. Please check for errors.');
    process.exit(1);
  }

  http.get(`http://localhost:${PORT}/api/health`, (res) => {
    if (res.statusCode === 200) {
      console.log('\n✅ Server is ready!');
      console.log(`\n🌐 Open your browser: http://localhost:${PORT}\n`);
      
      // Open browser automatically
      const platform = process.platform;
      let command;
      
      if (platform === 'darwin') {
        command = `open http://localhost:${PORT}`;
      } else if (platform === 'win32') {
        command = `start http://localhost:${PORT}`;
      } else {
        command = `xdg-open http://localhost:${PORT}`;
      }
      
      setTimeout(() => {
        exec(command, (err) => {
          if (err) {
            console.log(`💡 Could not auto-open browser. Please open: http://localhost:${PORT}`);
          }
        });
      }, 1000);
    } else {
      setTimeout(() => checkServerReady(attempts + 1), 1000);
    }
  }).on('error', () => {
    setTimeout(() => checkServerReady(attempts + 1), 1000);
  });
}

// Wait a moment, then start checking
setTimeout(() => checkServerReady(), 2000);

// Handle server exit
server.on('exit', (code) => {
  console.log(`\n⚠️  Server exited with code ${code}`);
  process.exit(code);
});

// Handle errors
server.on('error', (err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});


