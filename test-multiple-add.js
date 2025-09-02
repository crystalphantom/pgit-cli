#!/usr/bin/env node

// Simple integration test for multiple file add functionality
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create a test directory
const testDir = path.join(__dirname, 'test-multiple-add');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// Change to test directory
process.chdir(testDir);

// Create test files
console.log('Creating test files...');
fs.writeFileSync('test1.env', 'API_KEY=abc123');
fs.writeFileSync('test2.config', 'DEBUG=true');
fs.mkdirSync('test-dir', { recursive: true });
fs.writeFileSync('test-dir/config.json', '{"setting": "value"}');

try {
  // Initialize pgit
  console.log('Initializing pgit...');
  execSync('node ../dist/index.js init', { stdio: 'inherit' });
  
  // Test single file add
  console.log('Testing single file add...');
  execSync('node ../dist/index.js add test1.env', { stdio: 'inherit' });
  
  // Test multiple file add
  console.log('Testing multiple file add...');
  execSync('node ../dist/index.js add test2.config test-dir', { stdio: 'inherit' });
  
  // Check status
  console.log('Checking status...');
  execSync('node ../dist/index.js status', { stdio: 'inherit' });
  
  console.log('Integration test completed successfully!');
} catch (error) {
  console.error('Integration test failed:', error.message);
  process.exit(1);
} finally {
  // Cleanup
  process.chdir(__dirname);
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}