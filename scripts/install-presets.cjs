#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Installation script to copy built-in presets to global location
 * This ensures presets are always available regardless of installation method
 */

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.pgit', 'config');
const GLOBAL_PRESETS_FILE = path.join(GLOBAL_CONFIG_DIR, 'presets.json');
const PACKAGE_PRESETS_FILE = path.join(process.cwd(), 'presets.json');

function log(message) {
  console.log(`[pgit-install] ${message}`);
}

function error(message) {
  console.error(`[pgit-install] Error: ${message}`);
  process.exit(1);
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      log(`Created directory: ${dirPath}`);
    } catch (err) {
      error(`Failed to create directory ${dirPath}: ${err.message}`);
    }
  }
}

function loadJsonFile(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    log(`Warning: Failed to load ${filePath}: ${err.message}`);
    return defaultValue;
  }
}

function saveJsonFile(filePath, data) {
  try {
    ensureDirectoryExists(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    log(`Saved presets to ${filePath}`);
  } catch (err) {
    error(`Failed to save ${filePath}: ${err.message}`);
  }
}

function mergePresets(existingPresets, builtinPresets) {
  // If existing presets has nested structure, flatten it
  let flattenedExisting = existingPresets;
  if (existingPresets.presets && typeof existingPresets.presets === 'object') {
    // Handle nested structure from previous installations
    if (existingPresets.presets.presets) {
      flattenedExisting = existingPresets.presets.presets;
    } else {
      flattenedExisting = existingPresets.presets;
    }
  }

  const merged = { ...flattenedExisting };

  // Add built-in presets only if they don't exist or are marked as built-in
  Object.keys(builtinPresets).forEach(presetName => {
    if (!merged[presetName] || merged[presetName].source === 'builtin') {
      merged[presetName] = {
        ...builtinPresets[presetName],
        source: 'builtin',
        installed: true,
      };
    }
  });

  return merged;
}

function main() {
  log('Installing pgit presets to global location...');

  // Check if package presets exist
  if (!fs.existsSync(PACKAGE_PRESETS_FILE)) {
    error(`Package presets file not found: ${PACKAGE_PRESETS_FILE}`);
  }

  // Load built-in presets
  const builtinPresetsData = loadJsonFile(PACKAGE_PRESETS_FILE);
  if (!builtinPresetsData.presets) {
    error('Invalid package presets format - missing presets object');
  }

  const builtinPresets = builtinPresetsData.presets;
  log(`Loaded ${Object.keys(builtinPresets).length} built-in presets`);

  // Load existing global presets (if any)
  const existingPresetsData = loadJsonFile(GLOBAL_PRESETS_FILE, {});
  const existingPresets = existingPresetsData.presets || {};

  // Merge presets (existing user presets take priority)
  const mergedPresets = mergePresets(existingPresets, builtinPresets);

  // Save merged presets with correct structure
  const presetsData = {
    version: builtinPresetsData.version || '1.0.0',
    presets: mergedPresets,
    lastUpdated: new Date().toISOString(),
    source: 'pgit-cli-installation',
  };

  saveJsonFile(GLOBAL_PRESETS_FILE, presetsData);

  const totalPresets = Object.keys(mergedPresets).length;
  log(`Successfully installed ${totalPresets} presets to global location`);
  log(`Global presets location: ${GLOBAL_PRESETS_FILE}`);
}

// Run the installation
main();
