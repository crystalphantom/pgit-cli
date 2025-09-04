#!/usr/bin/env node

/**
 * Version Synchronization Script
 * Ensures version consistency across all project files
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function syncVersions() {
  try {
    // Get version from package.json (source of truth)
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = packageJson.version;

    console.log(chalk.blue(`🔄 Synchronizing version ${version} across all files...\n`));

    const filesToSync = [
      {
        path: path.join(__dirname, '..', 'src', 'cli.ts'),
        pattern: /\.version\(['"][^'"]+['"]\)/,
        replacement: `.version('${version}')`,
        description: 'CLI version declaration'
      },
      {
        path: path.join(__dirname, '..', 'src', 'types', 'config.types.ts'),
        pattern: /CURRENT_CONFIG_VERSION = ['"][^'"]+['"]/,
        replacement: `CURRENT_CONFIG_VERSION = '${version}'`,
        description: 'Config version constant'
      },
      {
        path: path.join(__dirname, '..', 'README.md'),
        pattern: /npm install -g @pgit\/cli@[^\s\)]+/g,
        replacement: `npm install -g @pgit/cli@${version}`,
        description: 'README installation examples'
      }
    ];

    let syncCount = 0;
    let errors = [];

    filesToSync.forEach(file => {
      if (!fs.existsSync(file.path)) {
        console.log(chalk.yellow(`⚠️  ${file.path} not found, skipping`));
        return;
      }

      try {
        let content = fs.readFileSync(file.path, 'utf8');
        const originalContent = content;

        if (file.pattern.global) {
          content = content.replace(file.pattern, file.replacement);
        } else {
          const match = content.match(file.pattern);
          if (match) {
            content = content.replace(file.pattern, file.replacement);
          } else {
            console.log(chalk.yellow(`⚠️  Pattern not found in ${file.path}`));
            return;
          }
        }

        if (content !== originalContent) {
          fs.writeFileSync(file.path, content);
          console.log(chalk.green(`✅ ${file.description}: Updated to v${version}`));
          syncCount++;
        } else {
          console.log(chalk.gray(`ℹ️  ${file.description}: Already v${version}`));
        }
      } catch (error) {
        errors.push(`${file.description}: ${error.message}`);
        console.log(chalk.red(`❌ ${file.description}: Error - ${error.message}`));
      }
    });

    console.log(chalk.blue(`\n📊 Synchronization Summary:`));
    console.log(chalk.green(`   ✅ Files updated: ${syncCount}`));
    
    if (errors.length > 0) {
      console.log(chalk.red(`   ❌ Errors: ${errors.length}`));
      errors.forEach(error => console.log(chalk.red(`      • ${error}`)));
      process.exit(1);
    } else {
      console.log(chalk.green(`\n🎉 All versions synchronized successfully to v${version}!`));
    }

  } catch (error) {
    console.error(chalk.red(`💥 Fatal error: ${error.message}`));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  syncVersions();
}

module.exports = { syncVersions };