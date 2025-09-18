import * as path from 'node:path';
import chalk from 'chalk';
import {
  CommandResult,
  CommandOptions,
  DEFAULT_PATHS,
  SystemStatus,
  RepositoryStatus,
  SymlinkHealth,
  ConfigHealth,
} from '../types/config.types.ts';
import { ConfigManager } from '../core/config.manager.ts';
import { FileSystemService } from '../core/filesystem.service.ts';
import { GitService } from '../core/git.service.ts';
import { BaseError } from '../errors/base.error.ts';

/**
 * Status command specific errors
 */
export class StatusError extends BaseError {
  public readonly code = 'STATUS_ERROR';
  public readonly recoverable = true;
}

export class NotInitializedError extends BaseError {
  public readonly code = 'NOT_INITIALIZED';
  public readonly recoverable = false;
}

/**
 * Status command for showing repository and system health
 */
export class StatusCommand {
  private readonly workingDir: string;
  private readonly fileSystem: FileSystemService;
  private readonly configManager: ConfigManager;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.fileSystem = new FileSystemService();
    this.configManager = new ConfigManager(this.workingDir, this.fileSystem);
  }

  /**
   * Execute status command (show both repositories)
   */
  public async execute(options: CommandOptions = {}): Promise<CommandResult> {
    try {
      const systemStatus = await this.getSystemStatus();

      if (!systemStatus.initialized) {
        throw new NotInitializedError(
          'Private git tracking is not initialized. Run "private init" first.',
        );
      }

      // Display status
      this.displayCombinedStatus(systemStatus, options.verbose);

      return {
        success: true,
        message: 'Status retrieved successfully',
        data: systemStatus,
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
        message: 'Failed to get status',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Execute private-only status command
   */
  public async executePrivateOnly(options: CommandOptions = {}): Promise<CommandResult> {
    try {
      const systemStatus = await this.getSystemStatus();

      if (!systemStatus.initialized) {
        throw new NotInitializedError(
          'Private git tracking is not initialized. Run "private init" first.',
        );
      }

      // Display private-only status
      this.displayPrivateStatus(systemStatus, options.verbose);

      return {
        success: true,
        message: 'Private status retrieved successfully',
        data: systemStatus.privateRepo,
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
        message: 'Failed to get private status',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Get complete system status
   */
  private async getSystemStatus(): Promise<SystemStatus> {
    const systemStatus: SystemStatus = {
      initialized: false,
      mainRepo: await this.getMainRepositoryStatus(),
      privateRepo: await this.getPrivateRepositoryStatus(),
      symlinks: await this.getSymlinkHealth(),
      config: await this.getConfigHealth(),
      isHealthy: false,
      issues: [],
    };

    // Check if initialized
    systemStatus.initialized = await this.configManager.exists();

    // Determine overall health
    systemStatus.isHealthy = this.determineOverallHealth(systemStatus);

    // Collect issues
    systemStatus.issues = this.collectSystemIssues(systemStatus);

    return systemStatus;
  }

  /**
   * Get main repository status
   */
  private async getMainRepositoryStatus(): Promise<RepositoryStatus> {
    const status: RepositoryStatus = {
      type: 'main',
      branch: 'unknown',
      isClean: false,
      stagedFiles: 0,
      modifiedFiles: 0,
      untrackedFiles: 0,
      deletedFiles: 0,
      exists: false,
      issues: [],
    };

    try {
      const gitService = new GitService(this.workingDir, this.fileSystem);

      if (await gitService.isRepository()) {
        status.exists = true;

        const gitStatus = await gitService.getStatus();
        status.branch = gitStatus.current || 'unknown';
        status.isClean = gitStatus.isClean;
        status.stagedFiles = gitStatus.staged.length;
        status.modifiedFiles = gitStatus.modified.length;
        status.untrackedFiles = gitStatus.untracked.length;
        status.deletedFiles = gitStatus.deleted.length;
      } else {
        status.issues.push('Directory is not a git repository');
      }
    } catch (error) {
      status.issues.push(
        `Failed to get main repository status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return status;
  }

  /**
   * Get private repository status
   */
  private async getPrivateRepositoryStatus(): Promise<RepositoryStatus> {
    const status: RepositoryStatus = {
      type: 'private',
      branch: 'unknown',
      isClean: false,
      stagedFiles: 0,
      modifiedFiles: 0,
      untrackedFiles: 0,
      deletedFiles: 0,
      exists: false,
      issues: [],
    };

    try {
      if (!(await this.configManager.exists())) {
        status.issues.push('Private git tracking not initialized');
        return status;
      }

      const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);

      if (!(await this.fileSystem.pathExists(storagePath))) {
        status.issues.push('Private storage directory does not exist');
        return status;
      }

      const gitService = new GitService(storagePath, this.fileSystem);

      if (await gitService.isRepository()) {
        status.exists = true;

        const gitStatus = await gitService.getStatus();
        status.branch = gitStatus.current || 'unknown';
        status.isClean = gitStatus.isClean;
        status.stagedFiles = gitStatus.staged.length;
        status.modifiedFiles = gitStatus.modified.length;
        status.untrackedFiles = gitStatus.untracked.length;
        status.deletedFiles = gitStatus.deleted.length;
      } else {
        status.issues.push('Private storage is not a git repository');
      }
    } catch (error) {
      status.issues.push(
        `Failed to get private repository status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return status;
  }

  /**
   * Get symbolic link health information
   */
  private async getSymlinkHealth(): Promise<SymlinkHealth> {
    const health: SymlinkHealth = {
      total: 0,
      healthy: 0,
      broken: 0,
      brokenLinks: [],
    };

    try {
      if (!(await this.configManager.exists())) {
        return health;
      }

      const config = await this.configManager.load();
      health.total = config.trackedPaths.length;

      for (const trackedPath of config.trackedPaths) {
        const fullPath = path.join(this.workingDir, trackedPath);
        const targetPath = path.join(this.workingDir, config.storagePath, trackedPath);

        try {
          if (await this.fileSystem.pathExists(fullPath)) {
            const stats = await this.fileSystem.getStats(fullPath);

            if (stats.isSymbolicLink()) {
              // Check if target exists
              if (await this.fileSystem.pathExists(targetPath)) {
                health.healthy++;
              } else {
                health.broken++;
                health.brokenLinks.push({
                  linkPath: fullPath,
                  targetPath,
                  reason: 'Target file does not exist',
                  repairable: false,
                });
              }
            } else {
              health.broken++;
              health.brokenLinks.push({
                linkPath: fullPath,
                targetPath,
                reason: 'Path exists but is not a symbolic link',
                repairable: true,
              });
            }
          } else {
            health.broken++;
            health.brokenLinks.push({
              linkPath: fullPath,
              targetPath,
              reason: 'Symbolic link does not exist',
              repairable: await this.fileSystem.pathExists(targetPath),
            });
          }
        } catch (error) {
          health.broken++;
          health.brokenLinks.push({
            linkPath: fullPath,
            targetPath,
            reason: `Error checking symbolic link: ${error instanceof Error ? error.message : String(error)}`,
            repairable: false,
          });
        }
      }
    } catch {
      // If we can't load config, we can't check symlinks
    }

    return health;
  }

  /**
   * Get configuration health
   */
  private async getConfigHealth(): Promise<ConfigHealth> {
    return this.configManager.getHealth();
  }

  /**
   * Determine overall system health
   */
  private determineOverallHealth(status: SystemStatus): boolean {
    return (
      status.initialized &&
      status.mainRepo.exists &&
      status.privateRepo.exists &&
      status.config.valid &&
      status.symlinks.broken === 0 &&
      status.issues.length === 0
    );
  }

  /**
   * Collect all system issues
   */
  private collectSystemIssues(status: SystemStatus): string[] {
    const issues: string[] = [];

    if (!status.initialized) {
      issues.push('Private git tracking not initialized');
    }

    if (!status.mainRepo.exists) {
      issues.push('Main repository not found');
    }

    if (!status.privateRepo.exists) {
      issues.push('Private repository not found');
    }

    if (!status.config.valid) {
      issues.push('Configuration is invalid');
    }

    if (status.symlinks.broken > 0) {
      issues.push(`${status.symlinks.broken} broken symbolic links found`);
    }

    // Add repository-specific issues
    issues.push(...status.mainRepo.issues);
    issues.push(...status.privateRepo.issues);
    issues.push(...status.config.errors);

    return issues;
  }

  /**
   * Display combined status (both repositories)
   */
  private displayCombinedStatus(status: SystemStatus, verbose?: boolean): void {
    console.log(chalk.blue.bold('📊 Private Git Tracking Status'));
    console.log();

    // Overall health
    if (status.isHealthy) {
      console.log(chalk.green('✓ System is healthy'));
    } else {
      console.log(chalk.red('✗ System has issues'));
    }
    console.log();

    // Main repository status
    console.log(chalk.blue.bold('📋 Main Repository'));
    this.displayRepositoryStatus(status.mainRepo, verbose);
    console.log();

    // Private repository status
    console.log(chalk.blue.bold('🔒 Private Repository'));
    this.displayRepositoryStatus(status.privateRepo, verbose);
    console.log();

    // Symbolic links health
    if (status.symlinks.total > 0) {
      console.log(chalk.blue.bold('🔗 Symbolic Links'));
      console.log(`   Total: ${status.symlinks.total}`);
      console.log(`   Healthy: ${chalk.green(status.symlinks.healthy)}`);
      console.log(
        `   Broken: ${status.symlinks.broken > 0 ? chalk.red(status.symlinks.broken) : chalk.green(status.symlinks.broken)}`,
      );

      if (verbose && status.symlinks.brokenLinks.length > 0) {
        console.log('   Broken links:');
        for (const brokenLink of status.symlinks.brokenLinks) {
          console.log(`     ${chalk.red('✗')} ${brokenLink.linkPath}`);
          console.log(`       Reason: ${brokenLink.reason}`);
          console.log(
            `       Repairable: ${brokenLink.repairable ? chalk.green('Yes') : chalk.red('No')}`,
          );
        }
      }
      console.log();
    }

    // Issues
    if (status.issues.length > 0) {
      console.log(chalk.red.bold('⚠️  Issues Found'));
      for (const issue of status.issues) {
        console.log(`   ${chalk.red('•')} ${issue}`);
      }
      console.log();
    }
  }

  /**
   * Display private repository status only
   */
  private displayPrivateStatus(status: SystemStatus, verbose?: boolean): void {
    console.log(chalk.blue.bold('🔒 Private Repository Status'));
    console.log();

    this.displayRepositoryStatus(status.privateRepo, verbose);

    // Show tracked files
    if (verbose) {
      this.displayTrackedFiles();
    }

    // Symbolic links health
    if (status.symlinks.total > 0) {
      console.log();
      console.log(chalk.blue.bold('🔗 Tracked Files Summary'));
      console.log(`   Total tracked files: ${status.symlinks.total}`);
      console.log(`   Healthy symbolic links: ${chalk.green(status.symlinks.healthy)}`);
      console.log(
        `   Broken symbolic links: ${status.symlinks.broken > 0 ? chalk.red(status.symlinks.broken) : chalk.green(status.symlinks.broken)}`,
      );
    }
  }

  /**
   * Display repository status information
   */
  private displayRepositoryStatus(repo: RepositoryStatus, verbose?: boolean): void {
    if (!repo.exists) {
      console.log(chalk.red('   ✗ Repository not found'));
      return;
    }

    console.log(`   Branch: ${chalk.cyan(repo.branch)}`);
    console.log(`   Status: ${repo.isClean ? chalk.green('Clean') : chalk.yellow('Has changes')}`);

    if (!repo.isClean || verbose) {
      if (repo.stagedFiles > 0) {
        console.log(`   Staged files: ${chalk.green(repo.stagedFiles)}`);
      }
      if (repo.modifiedFiles > 0) {
        console.log(`   Modified files: ${chalk.yellow(repo.modifiedFiles)}`);
      }
      if (repo.untrackedFiles > 0) {
        console.log(`   Untracked files: ${chalk.cyan(repo.untrackedFiles)}`);
      }
      if (repo.deletedFiles > 0) {
        console.log(`   Deleted files: ${chalk.red(repo.deletedFiles)}`);
      }
    }

    if (repo.issues.length > 0) {
      console.log(chalk.red('   Issues:'));
      for (const issue of repo.issues) {
        console.log(`     ${chalk.red('•')} ${issue}`);
      }
    }
  }

  /**
   * Display tracked files information
   */
  private async displayTrackedFiles(): Promise<void> {
    try {
      const config = await this.configManager.load();

      if (config.trackedPaths.length === 0) {
        console.log();
        console.log(chalk.gray('   No files are currently tracked'));
        return;
      }

      console.log();
      console.log(chalk.blue.bold('📁 Tracked Files'));

      for (const trackedPath of config.trackedPaths) {
        const fullPath = path.join(this.workingDir, trackedPath);
        const targetPath = path.join(this.workingDir, config.storagePath, trackedPath);

        const linkExists = await this.fileSystem.pathExists(fullPath);
        const targetExists = await this.fileSystem.pathExists(targetPath);

        let status = '';
        if (linkExists && targetExists) {
          status = chalk.green('✓');
        } else if (!linkExists && targetExists) {
          status = chalk.red('✗ Missing link');
        } else if (linkExists && !targetExists) {
          status = chalk.red('✗ Missing target');
        } else {
          status = chalk.red('✗ Both missing');
        }

        console.log(`   ${status} ${trackedPath}`);
      }
    } catch {
      console.log(chalk.red('   Failed to load tracked files information'));
    }
  }
}
