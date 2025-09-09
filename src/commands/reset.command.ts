import * as path from 'node:path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { CommandResult, CommandOptions, DEFAULT_PATHS } from '../types/config.types';
import { ConfigManager } from '../core/config.manager';
import { FileSystemService } from '../core/filesystem.service';
import { GitService } from '../core/git.service';
import { SymlinkService } from '../core/symlink.service';
import { BaseError } from '../errors/base.error';

/**
 * Reset command specific errors
 */
export class ResetError extends BaseError {
  public readonly code = 'RESET_ERROR';
  public readonly recoverable = true;
}

export class NotInitializedError extends BaseError {
  public readonly code = 'NOT_INITIALIZED';
  public readonly recoverable = false;
}

export class RestoreError extends BaseError {
  public readonly code = 'RESTORE_ERROR';
  public readonly recoverable = true;
}

/**
 * Reset operation result information
 */
export interface ResetResult {
  restoredFiles: number;
  removedSymlinks: number;
  removedDirectories: string[];
  configRemoved: boolean;
  gitExcludesCleaned: boolean;
  cleanedBackups: number;
  warnings: string[];
  errors: string[];
}

/**
 * Reset command for completely removing pgit setup and restoring files
 */
export class ResetCommand {
  private readonly workingDir: string;
  private readonly fileSystem: FileSystemService;
  private readonly configManager: ConfigManager;
  private readonly symlinkService: SymlinkService;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.fileSystem = new FileSystemService();
    this.configManager = new ConfigManager(this.workingDir, this.fileSystem);
    this.symlinkService = new SymlinkService(this.fileSystem);
  }

  /**
   * Execute the reset command
   */
  public async execute(force = false, options: CommandOptions = {}): Promise<CommandResult> {
    try {
      if (options.verbose) {
        console.log(chalk.blue('🔄 Starting complete pgit reset...'));
      }

      // Validate environment
      await this.validateEnvironment();

      // Confirm with user if not forced
      if (!force && !options.dryRun) {
        const confirm = this.confirmReset();
        if (!confirm) {
          return {
            success: false,
            message: 'Reset operation cancelled by user',
            exitCode: 0,
          };
        }
      }

      const result: ResetResult = {
        restoredFiles: 0,
        removedSymlinks: 0,
        removedDirectories: [],
        configRemoved: false,
        gitExcludesCleaned: false,
        cleanedBackups: 0,
        warnings: [],
        errors: [],
      };

      if (options.dryRun) {
        return await this.executeDryRun(result, options.verbose);
      }

      // Step 1: Load config to get tracked paths
      const config = await this.configManager.load();

      if (options.verbose) {
        console.log(chalk.gray(`   Found ${config.trackedPaths.length} tracked file(s)`));
      }

      // Step 2: Restore all tracked files
      if (options.verbose) {
        console.log(chalk.gray('   Restoring tracked files...'));
      }
      await this.restoreTrackedFiles(
        config.trackedPaths,
        config.storagePath,
        result,
        options.verbose,
      );

      // Step 3: Clean git excludes
      if (options.verbose) {
        console.log(chalk.gray('   Cleaning git exclude entries...'));
      }
      await this.cleanupGitExcludes(config.trackedPaths, result, options.verbose);

      // Step 4: Remove directories
      if (options.verbose) {
        console.log(chalk.gray('   Removing pgit directories...'));
      }
      await this.removeDirectories(config, result, options.verbose);

      // Step 5: Remove configuration
      if (options.verbose) {
        console.log(chalk.gray('   Removing configuration...'));
      }
      await this.removeConfiguration(result, options.verbose);

      // Step 6: Clean up any backup files created during the entire operation
      if (options.verbose) {
        console.log(chalk.gray('   Cleaning up backup files...'));
      }

      // Clear rollback actions first to prevent interference
      this.fileSystem.clearRollbackActions();

      // Clean backup files multiple times to catch all backups created during operations
      let totalCleaned = 0;
      for (let i = 0; i < 5; i++) {
        const cleaned = await this.cleanupBackupFiles(process.cwd());
        totalCleaned += cleaned;
        if (cleaned === 0) break; // No more backups found

        // Small delay to allow any pending operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      result.cleanedBackups = totalCleaned;

      // Display results
      this.displayResetResults(result);

      // Final cleanup pass to catch any lingering backup files
      const finalCleanup = await this.cleanupBackupFiles(process.cwd());
      if (finalCleanup > 0 && options.verbose) {
        console.log(
          chalk.gray(`   Final cleanup: removed ${finalCleanup} additional backup files`),
        );
      }

      const hasErrors = result.errors.length > 0;

      return {
        success: !hasErrors,
        message: hasErrors
          ? `Reset completed with ${result.errors.length} error(s)`
          : 'Reset completed successfully - pgit setup completely removed',
        data: result,
        exitCode: hasErrors ? 1 : 0,
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
        message: 'Failed to complete reset',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Validate that the environment has pgit initialized
   */
  private async validateEnvironment(): Promise<void> {
    if (!(await this.configManager.exists())) {
      throw new NotInitializedError('Private git tracking is not initialized. Nothing to reset.');
    }
  }

  /**
   * Confirm reset operation with user
   */
  private confirmReset(): boolean {
    // In a real CLI, this would use inquirer or similar
    // For now, we'll assume force mode or that confirmation was handled at CLI level
    console.log(
      chalk.yellow('⚠️  This will completely remove pgit setup and restore all tracked files.'),
    );
    console.log(chalk.yellow('   Use --force to skip this confirmation.'));
    return false; // Require explicit --force for safety
  }

  /**
   * Execute dry run to show what would be done
   */
  private async executeDryRun(result: ResetResult, _verbose?: boolean): Promise<CommandResult> {
    try {
      const config = await this.configManager.load();

      console.log(chalk.yellow('🔍 Dry run - showing what would be done:'));
      console.log(chalk.gray(`   Would restore ${config.trackedPaths.length} tracked file(s):`));

      for (const trackedPath of config.trackedPaths) {
        console.log(chalk.gray(`     - ${trackedPath}`));
      }

      console.log(chalk.gray('   Would remove directories:'));
      console.log(chalk.gray(`     - ${config.privateRepoPath}`));
      console.log(chalk.gray(`     - ${config.storagePath}`));
      console.log(chalk.gray(`     - ${DEFAULT_PATHS.config}`));

      console.log(chalk.gray('   Would clean git exclude entries for tracked files'));

      return {
        success: true,
        message: 'Dry run completed - use without --dry-run to execute',
        data: result,
        exitCode: 0,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to perform dry run',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Restore all tracked files from storage to main repository
   */
  private async restoreTrackedFiles(
    trackedPaths: string[],
    storagePath: string,
    result: ResetResult,
    verbose?: boolean,
  ): Promise<void> {
    for (const trackedPath of trackedPaths) {
      try {
        const linkPath = path.join(this.workingDir, trackedPath);
        const storedPath = path.join(this.workingDir, storagePath, trackedPath);

        // Check if symlink exists
        const linkInfo = await this.symlinkService.validate(linkPath);

        if (linkInfo.exists) {
          // Remove the symlink
          await this.fileSystem.remove(linkPath);
          result.removedSymlinks++;

          if (verbose) {
            console.log(chalk.gray(`     Removed symlink: ${trackedPath}`));
          }
        }

        // Check if stored file exists
        if (await this.fileSystem.pathExists(storedPath)) {
          // Ensure parent directory exists
          await this.fileSystem.createDirectory(path.dirname(linkPath));

          // Move the file back to original location
          await this.fileSystem.moveFileAtomic(storedPath, linkPath);
          result.restoredFiles++;

          // Clear rollback actions after successful move
          this.fileSystem.clearRollbackActions();

          if (verbose) {
            console.log(chalk.green(`     ✓ Restored: ${trackedPath}`));
          }
        } else {
          result.warnings.push(`Stored file not found: ${trackedPath}`);
          if (verbose) {
            console.log(chalk.yellow(`     ⚠️  Stored file not found: ${trackedPath}`));
          }
        }
      } catch (error) {
        const errorMsg = `Failed to restore ${trackedPath}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        if (verbose) {
          console.log(chalk.red(`     ✗ ${errorMsg}`));
        }
      }
    }
  }

  /**
   * Clean up git exclude entries for tracked paths
   */
  private async cleanupGitExcludes(
    trackedPaths: string[],
    result: ResetResult,
    verbose?: boolean,
  ): Promise<void> {
    try {
      const gitService = new GitService(this.workingDir, this.fileSystem);

      if (await gitService.isRepository()) {
        for (const trackedPath of trackedPaths) {
          try {
            await gitService.removeFromGitExclude(trackedPath);
            if (verbose) {
              console.log(chalk.gray(`     Removed exclude entry: ${trackedPath}`));
            }
          } catch (error) {
            result.warnings.push(`Failed to remove exclude entry for ${trackedPath}`);
          }
        }
        result.gitExcludesCleaned = true;
      }
    } catch (error) {
      result.warnings.push('Failed to clean git exclude entries');
    }
  }

  /**
   * Remove pgit directories
   */
  private async removeDirectories(
    config: { privateRepoPath: string; storagePath: string },
    result: ResetResult,
    verbose?: boolean,
  ): Promise<void> {
    const directoriesToRemove = [config.privateRepoPath, config.storagePath];

    for (const dirPath of directoriesToRemove) {
      try {
        const fullPath = path.join(this.workingDir, dirPath);

        if (await this.fileSystem.pathExists(fullPath)) {
          await this.fileSystem.remove(fullPath);
          result.removedDirectories.push(dirPath);

          if (verbose) {
            console.log(chalk.gray(`     Removed directory: ${dirPath}`));
          }
        }
      } catch (error) {
        const errorMsg = `Failed to remove directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        if (verbose) {
          console.log(chalk.red(`     ✗ ${errorMsg}`));
        }
      }
    }
  }

  /**
   * Remove configuration file
   */
  private async removeConfiguration(result: ResetResult, verbose?: boolean): Promise<void> {
    try {
      const configPath = path.join(this.workingDir, DEFAULT_PATHS.config);

      if (await this.fileSystem.pathExists(configPath)) {
        await this.fileSystem.remove(configPath);
        result.configRemoved = true;

        if (verbose) {
          console.log(chalk.gray(`     Removed configuration: ${DEFAULT_PATHS.config}`));
        }
      }
    } catch (error) {
      const errorMsg = `Failed to remove configuration: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      if (verbose) {
        console.log(chalk.red(`     ✗ ${errorMsg}`));
      }
    }
  }

  /**
   * Clean up any backup files created during the operation
   */
  private async cleanupBackupFiles(rootPath: string): Promise<number> {
    let cleanedCount = 0;
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(rootPath, entry.name);

        // Match backup files created by FileSystemService (contains .backup. followed by timestamp and hash)
        if (entry.isFile() && /\.backup\.\d+\.[a-f0-9]+$/.test(entry.name)) {
          await fs.unlink(fullPath);
          cleanedCount++;
        } else if (entry.isDirectory() && /\.backup\.\d+\.[a-f0-9]+$/.test(entry.name)) {
          // Remove backup directories as well
          await fs.remove(fullPath);
          cleanedCount++;
        } else if (entry.isSymbolicLink() && /\.backup\.\d+\.[a-f0-9]+$/.test(entry.name)) {
          // Remove backup symlinks (including broken ones)
          await fs.unlink(fullPath);
          cleanedCount++;
        } else if (entry.isDirectory() && !entry.name.startsWith('.git')) {
          // Recursively clean backup files in subdirectories (but skip .git)
          cleanedCount += await this.cleanupBackupFiles(fullPath);
        }
      }
    } catch (error) {
      // Ignore errors during backup cleanup - not critical
    }

    return cleanedCount;
  }

  /**
   * Display reset operation results
   */
  private displayResetResults(result: ResetResult): void {
    console.log(chalk.blue('\n📊 Reset Summary:'));
    console.log(chalk.green(`   ✓ Restored files: ${result.restoredFiles}`));
    console.log(chalk.green(`   ✓ Removed symlinks: ${result.removedSymlinks}`));
    console.log(chalk.green(`   ✓ Removed directories: ${result.removedDirectories.length}`));
    console.log(chalk.green(`   ✓ Configuration removed: ${result.configRemoved ? 'Yes' : 'No'}`));
    console.log(
      chalk.green(`   ✓ Git excludes cleaned: ${result.gitExcludesCleaned ? 'Yes' : 'No'}`),
    );
    console.log(chalk.green(`   ✓ Backup files cleaned: ${result.cleanedBackups}`));

    if (result.warnings.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Warnings (${result.warnings.length}):`));
      result.warnings.forEach(warning => {
        console.log(chalk.yellow(`   ${warning}`));
      });
    }

    if (result.errors.length > 0) {
      console.log(chalk.red(`\n❌ Errors (${result.errors.length}):`));
      result.errors.forEach(error => {
        console.log(chalk.red(`   ${error}`));
      });
    }

    if (result.errors.length === 0) {
      console.log(
        chalk.green(
          '\n✅ pgit setup completely removed. You can now run "pgit init" to start fresh.',
        ),
      );
    }
  }
}
