import * as path from 'node:path';
import chalk from 'chalk';
import { CommandResult, CommandOptions, DEFAULT_PATHS } from '../types/config.types.js';
import { ConfigManager } from '../core/config.manager.js';
import { FileSystemService } from '../core/filesystem.service.js';
import { GitService } from '../core/git.service.js';
import { BaseError } from '../errors/base.error.js';
import { InputValidator } from '../utils/input.validator.js';
import { InvalidArgumentError } from '../errors/specific.errors.js';

/**
 * Commit command specific errors
 */
export class CommitError extends BaseError {
  public readonly code = 'COMMIT_ERROR';
  public readonly recoverable = true;
}

export class NotInitializedError extends BaseError {
  public readonly code = 'NOT_INITIALIZED';
  public readonly recoverable = false;
}

export class NoChangesToCommitError extends BaseError {
  public readonly code = 'NO_CHANGES_TO_COMMIT';
  public readonly recoverable = false;
}

/**
 * Commit command for committing changes in private repository
 */
export class CommitCommand {
  private readonly workingDir: string;
  private readonly fileSystem: FileSystemService;
  private readonly configManager: ConfigManager;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.fileSystem = new FileSystemService();
    this.configManager = new ConfigManager(this.workingDir, this.fileSystem);
  }

  /**
   * Execute the commit command
   */
  public async execute(message?: string, options: CommandOptions = {}): Promise<CommandResult> {
    try {
      if (options.verbose) {
        console.log(chalk.blue('📝 Committing changes to private repository...'));
      }

      // Validate environment
      await this.validateEnvironment();

      // Validate commit message
      const commitMessage = this.validateCommitMessage(message);

      // Get private repository path
      const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
      const gitService = new GitService(privateStoragePath, this.fileSystem);

      // Check if there are changes to commit
      const hasChanges = await this.checkForChanges(gitService, options.verbose);
      if (!hasChanges) {
        throw new NoChangesToCommitError('No changes to commit in private repository');
      }

      // Stage all changes
      if (options.verbose) {
        console.log(chalk.gray('   Staging all changes...'));
      }
      await gitService.addAll();

      // Create commit
      if (options.verbose) {
        console.log(chalk.gray('   Creating commit...'));
      }
      const commitHash = await gitService.commit(commitMessage);

      if (options.verbose) {
        console.log(chalk.green(`   ✓ Commit created: ${commitHash.substring(0, 8)}`));
      }

      return {
        success: true,
        message: `Successfully committed changes to private repository: ${commitHash.substring(0, 8)}`,
        data: { commitHash, message: commitMessage },
        exitCode: 0,
      };
    } catch (error) {
      if (error instanceof BaseError) {
        return {
          success: false,
          message: error.message,
          error,
          exitCode: 1,
        };
      }

      return {
        success: false,
        message: 'Failed to commit changes to private repository',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Validate that the environment is ready for commit operation
   */
  private async validateEnvironment(): Promise<void> {
    // Check if private git tracking is initialized
    if (!(await this.configManager.exists())) {
      throw new NotInitializedError(
        'Private git tracking is not initialized. Run "private init" first.',
      );
    }

    // Check if private storage directory exists
    const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
    if (!(await this.fileSystem.pathExists(storagePath))) {
      throw new CommitError(
        'Private storage directory does not exist. The initialization may have failed.',
      );
    }

    // Check if private storage is a git repository
    const gitService = new GitService(storagePath, this.fileSystem);
    if (!(await gitService.isRepository())) {
      throw new CommitError(
        'Private storage is not a git repository. The initialization may have failed.',
      );
    }
  }

  /**
   * Validate and normalize commit message
   */
  private validateCommitMessage(message?: string): string {
    if (!message || !message.trim()) {
      // Generate default commit message with timestamp
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
      return `Update private files (${timestamp})`;
    }

    // Use enhanced validation
    try {
      InputValidator.validateCommitMessage(message);
      return InputValidator.sanitizeString(message.trim(), 500);
    } catch (error) {
      if (error instanceof InvalidArgumentError) {
        throw error;
      }
      throw new CommitError(
        'Invalid commit message',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Check if there are changes to commit
   */
  private async checkForChanges(gitService: GitService, verbose?: boolean): Promise<boolean> {
    try {
      const status = await gitService.getStatus();
      const hasChanges = !status.isClean;

      if (verbose) {
        if (hasChanges) {
          console.log(chalk.gray('   Changes detected:'));
          if (status.modified.length > 0) {
            console.log(chalk.gray(`     Modified files: ${status.modified.length}`));
          }
          if (status.untracked.length > 0) {
            console.log(chalk.gray(`     Untracked files: ${status.untracked.length}`));
          }
          if (status.deleted.length > 0) {
            console.log(chalk.gray(`     Deleted files: ${status.deleted.length}`));
          }
        } else {
          console.log(chalk.gray('   No changes detected'));
        }
      }

      return hasChanges;
    } catch (error) {
      throw new CommitError(
        'Failed to check repository status',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
