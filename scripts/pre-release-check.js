#!/usr/bin/env node

/**
 * Pre-Release Validation Script
 * Performs comprehensive checks before allowing a release
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

function checkVersionConsistency() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const targetVersion = packageJson.version;
  
  const checks = [
    {
      file: 'src/cli.ts',
      pattern: /\.version\(['"]([^'"]+)['"]\)/,
      description: 'CLI version declaration'
    },
    {
      file: 'src/types/config.types.ts', 
      pattern: /CURRENT_CONFIG_VERSION = ['"]([^'"]+)['"]/,
      description: 'Config version constant'
    }
  ];

  console.log(chalk.blue(`🔍 Checking version consistency for v${targetVersion}...\n`));

  let allValid = true;

  checks.forEach(check => {
    const filePath = path.join(__dirname, '..', check.file);
    if (!fs.existsSync(filePath)) {
      console.log(chalk.yellow(`⚠️  ${check.file} not found, skipping`));
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(check.pattern);
    
    if (!match) {
      console.log(chalk.red(`❌ ${check.description}: Pattern not found in ${check.file}`));
      allValid = false;
    } else {
      const foundVersion = match[1];
      if (foundVersion === targetVersion) {
        console.log(chalk.green(`✅ ${check.description}: v${foundVersion}`));
      } else {
        console.log(chalk.red(`❌ ${check.description}: Expected v${targetVersion}, found v${foundVersion}`));
        allValid = false;
      }
    }
  });

  return allValid;
}

function checkGitStatus() {
  console.log(chalk.blue(`🔍 Checking git status...\n`));

  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    
    if (status.trim()) {
      console.log(chalk.red('❌ Working directory is not clean:'));
      console.log(status);
      return false;
    } else {
      console.log(chalk.green('✅ Working directory is clean'));
      return true;
    }
  } catch (error) {
    console.log(chalk.red(`❌ Git status check failed: ${error.message}`));
    return false;
  }
}

function checkBranch() {
  console.log(chalk.blue(`🔍 Checking current branch...\n`));

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    
    if (branch === 'main') {
      console.log(chalk.green(`✅ On main branch`));
      return true;
    } else {
      console.log(chalk.red(`❌ Not on main branch (currently on: ${branch})`));
      return false;
    }
  } catch (error) {
    console.log(chalk.red(`❌ Branch check failed: ${error.message}`));
    return false;
  }
}

function checkBuildAndTest() {
  console.log(chalk.blue(`🔍 Running build and test...\n`));

  const commands = [
    { cmd: 'npm run lint', name: 'Linting' },
    { cmd: 'npm run build', name: 'Build' },
    { cmd: 'npm run test:coverage', name: 'Tests with coverage' }
  ];

  for (const command of commands) {
    try {
      console.log(chalk.gray(`   Running ${command.name}...`));
      execSync(command.cmd, { stdio: 'pipe' });
      console.log(chalk.green(`   ✅ ${command.name} passed`));
    } catch (error) {
      console.log(chalk.red(`   ❌ ${command.name} failed`));
      console.log(chalk.red(`   Error: ${error.message}`));
      return false;
    }
  }

  return true;
}

function checkRequiredFiles() {
  console.log(chalk.blue(`🔍 Checking required files...\n`));

  const requiredFiles = [
    'LICENSE',
    'README.md',
    'CHANGELOG.md',
    'package.json',
    'dist/cli.js',
    'dist/index.js'
  ];

  let allFilesExist = true;

  requiredFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      console.log(chalk.green(`✅ ${file} exists`));
    } else {
      console.log(chalk.red(`❌ ${file} missing`));
      allFilesExist = false;
    }
  });

  return allFilesExist;
}

function performPreReleaseCheck() {
  console.log(chalk.blue('🚀 Starting Pre-Release Validation\n'));
  console.log(chalk.gray('=' .repeat(50) + '\n'));

  const checks = [
    { name: 'Version Consistency', fn: checkVersionConsistency },
    { name: 'Git Status', fn: checkGitStatus },
    { name: 'Branch Check', fn: checkBranch },
    { name: 'Required Files', fn: checkRequiredFiles },
    { name: 'Build and Test', fn: checkBuildAndTest }
  ];

  let allChecksPassed = true;

  for (const check of checks) {
    const result = check.fn();
    if (!result) {
      allChecksPassed = false;
    }
    console.log(); // Add spacing
  }

  console.log(chalk.gray('=' .repeat(50)));

  if (allChecksPassed) {
    console.log(chalk.green('\n🎉 All pre-release checks passed! Ready for release.\n'));
    process.exit(0);
  } else {
    console.log(chalk.red('\n💥 Pre-release validation failed!'));
    console.log(chalk.yellow('Please fix the issues above before releasing.\n'));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  performPreReleaseCheck();
}

module.exports = { 
  checkVersionConsistency, 
  checkGitStatus, 
  checkBranch, 
  checkBuildAndTest, 
  checkRequiredFiles,
  performPreReleaseCheck 
};