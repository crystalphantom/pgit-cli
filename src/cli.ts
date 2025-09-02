#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { InitCommand } from './commands/init.command';
import { StatusCommand } from './commands/status.command';
import { AddCommand } from './commands/add.command';
import { CommitCommand } from './commands/commit.command';
import { GitOpsCommand } from './commands/gitops.command';
import { CleanupCommand } from './commands/cleanup.command';
import { EnhancedErrorHandler } from './errors/enhanced.error-handler';

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  program
    .name('pgit')
    .description('Private Git Tracking CLI - Manage private files with dual repositories')
    .version('1.0.1');

  // Initialize command
  program
    .command('init')
    .description('Initialize private git tracking in current directory')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      try {
        const initCommand = new InitCommand();
        const result = await initCommand.execute({ verbose: options.verbose });
        
        if (result.success) {
          console.log(chalk.green(`✓ ${result.message || 'Private git tracking initialized successfully'}`));
        } else {
          console.error(chalk.red(`✗ ${result.message || 'Failed to initialize private git tracking'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      try {
        const statusCommand = new StatusCommand();
        const result = await statusCommand.execute({ verbose: options.verbose });
        
        if (result.success) {
          console.log(result.message || 'Status retrieved successfully');
        } else {
          console.error(chalk.red(`✗ ${result.message || 'Failed to get status'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      try {
        const statusCommand = new StatusCommand();
        const result = await statusCommand.executePrivateOnly({ verbose: options.verbose });
        
        if (result.success) {
          console.log(result.message || 'Private status retrieved successfully');
        } else {
          console.error(chalk.red(`✗ ${result.message || 'Failed to get private status'}`));
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Add command
  program
    .command('add <path>')
    .description('Add file or directory to private tracking')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (path, options) => {
      try {
        const addCommand = new AddCommand();
        const result = await addCommand.execute(path, { verbose: options.verbose });
        
        if (result.success) {
          console.log(chalk.green(`✓ ${result.message || 'File added to private tracking successfully'}`));
        } else {
          console.error(chalk.red(`✗ ${result.message || 'Failed to add file to private tracking'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      try {
        const commitCommand = new CommitCommand();
        const result = await commitCommand.execute(options.message, { verbose: options.verbose });
        
        if (result.success) {
          console.log(chalk.green(`✓ ${result.message || 'Changes committed to private repository successfully'}`));
        } else {
          console.error(chalk.red(`✗ ${result.message || 'Failed to commit changes to private repository'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.log(
          { 
            maxCount: parseInt(options.maxCount) || 10, 
            oneline: options.oneline 
          },
          { verbose: options.verbose }
        );
        
        if (!result.success) {
          console.error(chalk.red(`✗ ${result.message || 'Failed to get commit history'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.addChanges(options.all, { verbose: options.verbose });
        
        if (result.success) {
          console.log(chalk.green(`✓ ${result.message || 'Changes staged successfully'}`));
        } else {
          console.error(chalk.red(`✗ ${result.message || 'Failed to stage changes'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.diff(
          { 
            cached: options.cached, 
            nameOnly: options.nameOnly 
          },
          { verbose: options.verbose }
        );
        
        if (!result.success) {
          console.error(chalk.red(`✗ ${result.message || 'Failed to get differences'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (name, options) => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.branch(name, options.create, { verbose: options.verbose });
        
        if (result.success && name && options.create) {
          console.log(chalk.green(`✓ ${result.message || 'Branch created successfully'}`));
        } else if (!result.success) {
          console.error(chalk.red(`✗ ${result.message || 'Failed to perform branch operation'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (target, options) => {
      try {
        const gitOpsCommand = new GitOpsCommand();
        const result = await gitOpsCommand.checkout(target, { verbose: options.verbose });
        
        if (result.success) {
          console.log(chalk.green(`✓ ${result.message || 'Checkout completed successfully'}`));
        } else {
          console.error(chalk.red(`✗ ${result.message || 'Failed to checkout'}`));
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
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      try {
        const cleanupCommand = new CleanupCommand();
        const result = await cleanupCommand.execute(options.force, { verbose: options.verbose });
        
        if (result.success) {
          console.log(chalk.green(`✓ ${result.message || 'Cleanup completed successfully'}`));
        } else {
          console.error(chalk.red(`✗ ${result.message || 'Cleanup completed with issues'}`));
          process.exit(result.exitCode);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Global error handler
  program.exitOverride((err) => {
    if (err.code === 'commander.help') {
      process.exit(0);
    }
    if (err.code === 'commander.version') {
      process.exit(0);
    }
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

// Run the CLI
if (require.main === module) {
  main().catch(handleError);
}