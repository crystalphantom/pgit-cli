/**
 * Private Git Tracking CLI
 *
 * Main entry point for the private git tracking CLI tool.
 * This tool allows developers to version control private files
 * separately from the main team repository using symbolic links
 * and a dual repository system.
 */

export * from './cli';
export * from './commands/init.command';
export * from './commands/status.command';
export * from './core/config.manager';
export * from './core/filesystem.service';
export * from './core/git.service';
export * from './utils/platform.detector';
export * from './types/config.types';
export * from './types/config.schema';
export * from './errors/base.error';
export * from './errors/filesystem.error';
export * from './errors/git.error';
