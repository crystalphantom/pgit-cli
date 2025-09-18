/**
 * Private Git Tracking CLI
 *
 * Main entry point for the private git tracking CLI tool.
 * This tool allows developers to version control private files
 * separately from the main team repository using symbolic links
 * and a dual repository system.
 */

export * from './cli.js';
export * from './commands/init.command.js';
export * from './commands/status.command.js';
export * from './core/config.manager.js';
export * from './core/filesystem.service.js';
export * from './core/git.service.js';
export * from './utils/platform.detector.js';
export * from './types/config.types.js';
export * from './types/config.schema.js';
export * from './errors/base.error.js';
export * from './errors/filesystem.error.js';
export * from './errors/git.error.js';
