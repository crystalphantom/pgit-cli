#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { InitCommand } from './commands/init.command';
import { StatusCommand } from './commands/status.command';
import { AddCommand } from './commands/add.command';
import { CommitCommand } from './commands/commit.command';
import { GitOpsCommand } from './commands/gitops.command';
import { CleanupCommand } from './commands/cleanup.command';
import { ResetCommand } from './commands/reset.command';
import { PresetCommand } from './commands/preset.command';
import { EnhancedErrorHandler } from './errors/enhanced.error-handler';
import { logger, LogLevel } from './utils/logger.service';
import { FALLBACK_VERSION } from './types/config.types';

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  // Read version from package.json
  let version = FALLBACK_VERSION; // fallback version
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    version = packageJson.version;
  } catch {
    logger.warn('Could not read package.json for version, using fallback');
  }

  program
    .name('pgit')
    .description('Private Git Tracking CLI - Manage private files with dual repositories')
    .version(version, '-v, -V, --version', 'Output the current version')
    .option('--verbose', 'Show verbose output')
    .on('option:verbose', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Verbose mode enabled');
    });

  // Initialize command
  program
    .command('init')
    .description('Initialize private git tracking in current directory')
    .action(async options => {
      try {
        const initCommand = new InitCommand();
        const result = await initCommand.execute({ verbose: options.verbose });

        if (result.success) {
          logger.success(result.message || 'Private git tracking initialized successfully');
        } else {
          logger.error(result.message || 'Failed to initialize private git tracking');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error, 'init');
      }
    });

  // Status command
  program
    .command('status')
    .description('Show status of both main and private repositories')
    .action(async options => {
      try {
        const statusCommand = new StatusCommand();
        const result = await statusCommand.execute({ verbose: options.verbose });

        if (result.success) {
          logger.info(result.message || 'Status retrieved successfully');
        } else {
          logger.error(result.message || 'Failed to get status');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Private status command (detailed private repo status only)
  program
    .command('private-status')
    .description('Show detailed status of private repository only')
    .action(async options => {
      try {
        const statusCommand = new StatusCommand();
        const result = await statusCommand.executePrivateOnly({ verbose: options.verbose });

        if (result.success) {
          logger.info(result.message || 'Private status retrieved successfully');
        } else {
          logger.error(result.message || 'Failed to get private status');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Add command
  program
    .command('add <path...>')
    .description('Add file(s) or directory(ies) to private tracking')
    .action(async (paths, options) => {
      try {
        const addCommand = new AddCommand();
        const result = await addCommand.execute(paths, { verbose: options.verbose });

        if (result.success) {
          logger.success(result.message || 'Files added to private tracking successfully');
        } else {
          logger.error(result.message || 'Failed to add files to private tracking');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Commit command
  program
    .command('commit')
    .description('Commit changes to private repository')
    .option('-m, --message <message>', 'Commit message')
    .action(async options => {
      try {
        const commitCommand = new CommitCommand();
        const result = await commitCommand.execute(options.message, { verbose: options.verbose });

        if (result.success) {
          logger.success(result.message || 'Changes committed to private repository successfully');
        } else {
          logger.error(result.message || 'Failed to commit changes to private repository');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Preset commands
  const presetCmd = program
    .command('preset')
    .description('Manage file presets for common workflows (apply|add|remove|list|show)');

  presetCmd
    .command('apply <preset-name>')
    .description('Apply a preset by adding all its paths to private tracking')
    .action(async (presetName, options) => {
      try {
        const presetCommand = new PresetCommand();
        const result = await presetCommand.apply(presetName, {
          verbose: options.parent?.parent?.verbose || false,
        });

        if (result.success) {
          // Success message is handled by the command itself
        } else {
          logger.error(result.message || 'Failed to apply preset');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  presetCmd
    .command('add <preset-name> <paths...>')
    .description('Add a new user preset with specified paths')
    .option('-g, --global', 'Create a global preset (available across all projects)')
    .action(async (presetName, paths, options) => {
      try {
        const presetCommand = new PresetCommand();
        const result = await presetCommand.add(presetName, paths, {
          verbose: options.parent?.parent?.verbose || false,
          global: options.global || false,
        });

        if (result.success) {
          // Success message is handled by the command itself
        } else {
          logger.error(result.message || 'Failed to add preset');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  presetCmd
    .command('remove <preset-name>')
    .description('Remove a user-defined preset')
    .option('-g, --global', 'Remove a global preset')
    .action(async (presetName, options) => {
      try {
        const presetCommand = new PresetCommand();
        const result = await presetCommand.remove(presetName, {
          verbose: options.parent?.parent?.verbose || false,
          global: options.global || false,
        });

        if (result.success) {
          // Success message is handled by the command itself
        } else {
          logger.error(result.message || 'Failed to remove preset');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  presetCmd
    .command('list')
    .description('List all available presets')
    .action(async options => {
      try {
        const presetCommand = new PresetCommand();
        const result = await presetCommand.list({
          verbose: options.parent?.parent?.verbose || false,
        });

        if (!result.success) {
          logger.error(result.message || 'Failed to list presets');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  presetCmd
    .command('show <preset-name>')
    .description('Show details about a specific preset')
    .action(async (presetName, options) => {
      try {
        const presetCommand = new PresetCommand();
        const result = await presetCommand.show(presetName, {
          verbose: options.parent?.parent?.verbose || false,
        });

        if (!result.success) {
          logger.error(result.message || 'Failed to show preset');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Git log command
  program
    .command('log')
    .description('Show commit history of private repository')
    .option('-n, --max-count <number>', 'Limit number of commits', '10')
    .option('--oneline', 'Show each commit on a single line')
    .action(async options => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.log(
          {
            maxCount: parseInt(options.maxCount) || 10,
            oneline: options.oneline,
          },
          { verbose: options.verbose },
        );

        if (!result.success) {
          logger.error(result.message || 'Failed to get commit history');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Git add-changes command
  program
    .command('add-changes')
    .description('Stage changes in private repository')
    .option('-A, --all', 'Stage all changes')
    .action(async options => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.addChanges(options.all, { verbose: options.verbose });

        if (result.success) {
          logger.success(result.message || 'Changes staged successfully');
        } else {
          logger.error(result.message || 'Failed to stage changes');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Git diff command
  program
    .command('diff')
    .description('Show differences in private repository')
    .option('--cached', 'Show staged changes')
    .option('--name-only', 'Show only file names')
    .action(async options => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.diff(
          {
            cached: options.cached,
            nameOnly: options.nameOnly,
          },
          { verbose: options.verbose },
        );

        if (!result.success) {
          logger.error(result.message || 'Failed to get differences');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Git branch command
  program
    .command('branch [name]')
    .description('List or create branches in private repository')
    .option('-b, --create', 'Create new branch')
    .action(async (name, options) => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.branch(name, options.create, {
          verbose: options.verbose,
        });

        if (result.success && name && options.create) {
          logger.success(result.message || 'Branch created successfully');
        } else if (!result.success) {
          logger.error(result.message || 'Failed to perform branch operation');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Git checkout command
  program
    .command('checkout <target>')
    .description('Switch branches or restore files in private repository')
    .action(async (target, options) => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.checkout(target, { verbose: options.verbose });

        if (result.success) {
          logger.success(result.message || 'Checkout completed successfully');
        } else {
          logger.error(result.message || 'Failed to checkout');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Cleanup command
  program
    .command('cleanup')
    .description('Fix and repair private git tracking system')
    .option('--force', 'Force cleanup operations')
    .action(async options => {
      try {
        const cleanupCommand = new CleanupCommand();
        const result = await cleanupCommand.execute(options.force, { verbose: options.verbose });

        if (result.success) {
          logger.success(result.message || 'Cleanup completed successfully');
        } else {
          logger.error(result.message || 'Cleanup completed with issues');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Reset command
  program
    .command('reset')
    .description('Completely remove pgit setup and restore all tracked files to main repository')
    .option('--force', 'Skip confirmation prompt')
    .option('--dry-run', 'Show what would be done without executing')
    .action(async options => {
      try {
        const resetCommand = new ResetCommand();
        const result = await resetCommand.execute(options.force, {
          verbose: options.verbose,
          dryRun: options.dryRun,
        });

        if (result.success) {
          logger.success(result.message || 'Reset completed successfully');
        } else {
          logger.error(result.message || 'Reset failed');
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Handle help command specially to ensure proper exit codes
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || (args.length === 1 && args[0] === 'help')) {
    program.outputHelp();
    process.exit(0);
  }

  // Global error handler - only override for actual errors, not help/version
  program.exitOverride(err => {
    // Allow normal exit codes for help and version commands
    if (err.code === 'commander.version' || err.code === 'commander.helpDisplayed') {
      process.exit(0);
    }
    // Force exit code 1 for other errors
    process.exit(1);
  });

  // Parse command line arguments
  await program.parseAsync(process.argv);
}

/**
 * Handle errors with enhanced formatting and recovery suggestions
 */
function handleError(error: unknown, command?: string): void {
  const context = EnhancedErrorHandler.createContext(command, [], process.cwd());
  EnhancedErrorHandler.handleError(error, context);
  process.exit(1);
}

// Run the CLI if this is the main module
if (process.argv[1] && (process.argv[1].includes('cli') || process.argv[1].includes('pgit'))) {
  main().catch(handleError);
}
