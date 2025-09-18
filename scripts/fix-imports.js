#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively find all .js files in the dist directory
 */
function findJsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findJsFiles(fullPath, files);
    } else if (item.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Fix import statements in a JavaScript file to include .js extensions
 */
function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Fix relative imports that don't have .js extensions
  // Match: import { something } from './module';
  // Replace: import { something } from './module.js';
  const importRegex = /import\s+{[^}]+}\s+from\s+['"](\.[^'"]*?)['"];?/g;

  content = content.replace(importRegex, (match, importPath) => {
    // Don't modify if it already has .js extension or is a directory import
    if (importPath.endsWith('.js') || importPath.endsWith('/')) {
      return match;
    }

    // Add .js extension
    const fixedPath = importPath + '.js';
    modified = true;
    return match.replace(importPath, fixedPath);
  });

  // Also fix default imports and namespace imports
  const defaultImportRegex = /import\s+[^'"]+\s+from\s+['"](\.[^'"]*?)['"];?/g;

  content = content.replace(defaultImportRegex, (match, importPath) => {
    // Don't modify if it already has .js extension or is a directory import
    if (importPath.endsWith('.js') || importPath.endsWith('/')) {
      return match;
    }

    // Add .js extension
    const fixedPath = importPath + '.js';
    modified = true;
    return match.replace(importPath, fixedPath);
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed imports in: ${path.relative(process.cwd(), filePath)}`);
  }
}

/**
 * Main function
 */
function main() {
  const distDir = path.join(__dirname, '..', 'dist');

  if (!fs.existsSync(distDir)) {
    console.error('dist directory not found. Run npm run build first.');
    process.exit(1);
  }

  console.log('🔧 Fixing ES module imports in dist directory...');

  const jsFiles = findJsFiles(distDir);
  let fixedCount = 0;

  for (const file of jsFiles) {
    fixImportsInFile(file);
    fixedCount++;
  }

  console.log(`✅ Fixed imports in ${fixedCount} files`);
}

main();
