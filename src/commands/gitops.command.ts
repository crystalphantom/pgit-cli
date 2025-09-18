import * as path from 'node:path';
import chalk from 'chalk';
import { CommandResult, CommandOptions, DEFAULT_PATHS } from '../types/config.types.js';
import { ConfigManager } from '../core/config.manager.js';
import { FileSystemService } from '../core/filesystem.service.js';
import { GitService, GitLogEntry } from '../core/git.service.js';
import { BaseError } from '../errors/base.error.js';

/**
 * Git operations command specific errors
 */
export class GitOpsError extends BaseError {
  public readonly code = 'GIT_OPS_ERROR';
  public readonly recoverable = true;
}

export class NotInitializedError extends BaseError {
  public readonly code = 'NOT_INITIALIZED';
  public readonly recoverable = false;
}

/**
 * Options for git log command
 */
export interface LogOptions {
  maxCount?: number;
  oneline?: boolean;
}

/**
 * Options for git diff command
 */
export interface DiffOptions {
  cached?: boolean;
  nameOnly?: boolean;
}

/**
 * Git operations command for private repository
 */
export class GitOpsCommand {
  private readonly workingDir: string;
  private readonly fileSystem: FileSystemService;
  private readonly configManager: ConfigManager;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.fileSystem = new FileSystemService();
    this.configManager = new ConfigManager(this.workingDir, this.fileSystem);
  }

  /**
   * Execute git log command
   */
  public async log(
    options: LogOptions = {},
    cmdOptions: CommandOptions = {},
  ): Promise<CommandResult> {
    try {
      const gitService = await this.getPrivateGitService();

      if (cmdOptions.verbose) {
        console.log(chalk.blue('📜 Getting commit history from private repository...'));
      }

      const logEntries = await gitService.getLog({
        maxCount: options.maxCount || 10,
        oneline: options.oneline || false,
      });

      if (logEntries.length === 0) {
        console.log(chalk.yellow('No commits found in private repository'));
        return {
          success: true,
          message: 'No commits found',
          data: [],
          exitCode: 0,
        };
      }

      // Display log entries
      this.displayLogEntries(logEntries, options.oneline);

      return {
        success: true,
        message: `Retrieved ${logEntries.length} commit(s)`,
        data: logEntries,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleError(error, 'Failed to get commit history');
    }
  }

  /**
   * Execute git diff command
   */
  public async diff(
    options: DiffOptions = {},
    cmdOptions: CommandOptions = {},
  ): Promise<CommandResult> {
    try {
      const gitService = await this.getPrivateGitService();

      if (cmdOptions.verbose) {
        console.log(chalk.blue('🔍 Getting differences from private repository...'));
      }

      const diffOutput = await gitService.getDiff({
        cached: options.cached || false,
        nameOnly: options.nameOnly || false,
      });

      if (!diffOutput.trim()) {
        console.log(chalk.yellow('No differences found'));
        return {
          success: true,
          message: 'No differences found',
          data: '',
          exitCode: 0,
        };
      }

      // Display diff output
      console.log(diffOutput);

      return {
        success: true,
        message: 'Differences retrieved successfully',
        data: diffOutput,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleError(error, 'Failed to get differences');
    }
  }

  /**
   * Execute git add command for staging changes
   */
  public async addChanges(all = false, cmdOptions: CommandOptions = {}): Promise<CommandResult> {
    try {
      const gitService = await this.getPrivateGitService();

      if (cmdOptions.verbose) {
        console.log(
          chalk.blue(
            `📝 ${all ? 'Staging all changes' : 'Staging changes'} in private repository...`,
          ),
        );
      }

      if (all) {
        await gitService.addAll();
      } else {
        // For interactive mode, we'll add all modified files
        const status = await gitService.getStatus();
        const filesToAdd = [...status.modified, ...status.untracked];

        if (filesToAdd.length === 0) {
          console.log(chalk.yellow('No changes to stage'));
          return {
            success: true,
            message: 'No changes to stage',
            exitCode: 0,
          };
        }

        await gitService.addFiles(filesToAdd);
      }

      if (cmdOptions.verbose) {
        console.log(chalk.green('   ✓ Changes staged successfully'));
      }

      return {
        success: true,
        message: 'Changes staged successfully',
        exitCode: 0,
      };
    } catch (error) {
      return this.handleError(error, 'Failed to stage changes');
    }
  }

  /**
   * Execute git branch operations
   */
  public async branch(
    branchName?: string,
    create = false,
    cmdOptions: CommandOptions = {},
  ): Promise<CommandResult> {
    try {
      const gitService = await this.getPrivateGitService();

      if (branchName && create) {
        // Create new branch
        if (cmdOptions.verbose) {
          console.log(
            chalk.blue(`🌿 Creating new branch '${branchName}' in private repository...`),
          );
        }

        await gitService.createBranch(branchName);

        if (cmdOptions.verbose) {
          console.log(chalk.green(`   ✓ Branch '${branchName}' created and checked out`));
        }

        return {
          success: true,
          message: `Branch '${branchName}' created successfully`,
          exitCode: 0,
        };
      } else {
        // List branches
        if (cmdOptions.verbose) {
          console.log(chalk.blue('🌿 Getting branches from private repository...'));
        }

        const branches = await gitService.getBranches();

        console.log(chalk.bold('Branches:'));
        for (const branch of branches.all) {
          const isCurrent = branch === branches.current;
          const marker = isCurrent ? chalk.green('* ') : '  ';
          const branchColor = isCurrent ? chalk.green : chalk.white;
          console.log(`${marker}${branchColor(branch)}`);
        }

        return {
          success: true,
          message: `Found ${branches.all.length} branch(es)`,
          data: branches,
          exitCode: 0,
        };
      }
    } catch (error) {
      return this.handleError(error, 'Failed to perform branch operation');
    }
  }

  /**
   * Execute git checkout command
   */
  public async checkout(target: string, cmdOptions: CommandOptions = {}): Promise<CommandResult> {
    try {
      const gitService = await this.getPrivateGitService();

      if (cmdOptions.verbose) {
        console.log(chalk.blue(`🔄 Checking out '${target}' in private repository...`));
      }

      await gitService.checkout(target);

      if (cmdOptions.verbose) {
        console.log(chalk.green(`   ✓ Switched to '${target}'`));
      }

      return {
        success: true,
        message: `Switched to '${target}' successfully`,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleError(error, `Failed to checkout '${target}'`);
    }
  }

  /**
   * Execute git reset command
   */
  public async reset(
    mode: 'soft' | 'hard' = 'soft',
    commit = 'HEAD',
    cmdOptions: CommandOptions = {},
  ): Promise<CommandResult> {
    try {
      const gitService = await this.getPrivateGitService();

      if (cmdOptions.verbose) {
        console.log(chalk.blue(`🔄 Resetting private repository (${mode}) to ${commit}...`));
      }

      await gitService.reset(mode, commit);

      if (cmdOptions.verbose) {
        console.log(chalk.green(`   ✓ Reset to ${commit} (${mode}) completed`));
      }

      return {
        success: true,
        message: `Reset to ${commit} (${mode}) completed successfully`,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleError(error, `Failed to reset to ${commit}`);
    }
  }

  /**
   * Get current branch name
   */
  public async getCurrentBranch(cmdOptions: CommandOptions = {}): Promise<CommandResult> {
    try {
      const gitService = await this.getPrivateGitService();

      const currentBranch = await gitService.getCurrentBranch();

      if (cmdOptions.verbose) {
        console.log(chalk.blue(`Current branch: ${chalk.green(currentBranch)}`));
      }

      return {
        success: true,
        message: currentBranch,
        data: currentBranch,
        exitCode: 0,
      };
    } catch (error) {
      return this.handleError(error, 'Failed to get current branch');
    }
  }

  /**
   * Get private git service instance
   */
  private async getPrivateGitService(): Promise<GitService> {
    // Validate environment
    if (!(await this.configManager.exists())) {
      throw new NotInitializedError(
        'Private git tracking is not initialized. Run "private init" first.',
      );
    }

    const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);

    if (!(await this.fileSystem.pathExists(privateStoragePath))) {
      throw new GitOpsError(
        'Private storage directory does not exist. The initialization may have failed.',
      );
    }

    const gitService = new GitService(privateStoragePath, this.fileSystem);

    if (!(await gitService.isRepository())) {
      throw new GitOpsError(
        'Private storage is not a git repository. The initialization may have failed.',
      );
    }

    return gitService;
  }

  /**
   * Display log entries in formatted output
   */
  private displayLogEntries(logEntries: GitLogEntry[], oneline?: boolean): void {
    console.log(chalk.bold('📜 Commit History (Private Repository):'));
    console.log();

    for (const entry of logEntries) {
      if (oneline) {
        const shortHash = entry.hash.substring(0, 8);
        console.log(`${chalk.yellow(shortHash)} ${entry.message}`);
      } else {
        console.log(`${chalk.yellow('commit')} ${entry.hash}`);
        console.log(`${chalk.cyan('Author:')} ${entry.author} <${entry.email}>`);
        console.log(`${chalk.cyan('Date:')} ${entry.date}`);
        console.log();
        console.log(`    ${entry.message}`);
        console.log();
      }
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: unknown, defaultMessage: string): CommandResult {
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
      message: defaultMessage,
      error: error instanceof Error ? error : new Error(String(error)),
      exitCode: 1,
    };
  }
}
