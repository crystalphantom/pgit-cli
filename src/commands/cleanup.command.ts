import * as path from 'node:path';
import chalk from 'chalk';
import { CommandResult, CommandOptions, DEFAULT_PATHS } from '../types/config.types';
import { ConfigManager } from '../core/config.manager';
import { FileSystemService } from '../core/filesystem.service';
import { GitService } from '../core/git.service';
import { SymlinkService } from '../core/symlink.service';
import { BaseError } from '../errors/base.error';

/**
 * Cleanup command specific errors
 */
export class CleanupError extends BaseError {
  public readonly code = 'CLEANUP_ERROR';
  public readonly recoverable = true;
}

export class NotInitializedError extends BaseError {
  public readonly code = 'NOT_INITIALIZED';
  public readonly recoverable = false;
}

/**
 * Cleanup result information
 */
export interface CleanupResult {
  repairedSymlinks: number;
  cleanedIndexEntries: number;
  updatedGitignore: boolean;
  configValidated: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Cleanup command for system repair and maintenance
 */
export class CleanupCommand {
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
   * Execute the cleanup command
   */
  public async execute(force = false, options: CommandOptions = {}): Promise<CommandResult> {
    try {
      if (options.verbose) {
        console.log(chalk.blue('🧹 Starting system cleanup and repair...'));
      }

      // Validate environment
      await this.validateEnvironment();

      const result: CleanupResult = {
        repairedSymlinks: 0,
        cleanedIndexEntries: 0,
        updatedGitignore: false,
        configValidated: false,
        issues: [],
        warnings: [],
      };

      // Step 1: Validate and repair configuration
      if (options.verbose) {
        console.log(chalk.gray('   Validating configuration...'));
      }
      await this.validateAndRepairConfig(result, options.verbose);

      // Step 2: Repair broken symbolic links
      if (options.verbose) {
        console.log(chalk.gray('   Checking and repairing symbolic links...'));
      }
      await this.repairSymbolicLinks(result, options.verbose);

      // Step 3: Clean up git index issues
      if (options.verbose) {
        console.log(chalk.gray('   Cleaning up git index...'));
      }
      await this.cleanupGitIndex(result, force, options.verbose);

      // Step 4: Update .gitignore if needed
      if (options.verbose) {
        console.log(chalk.gray('   Checking .gitignore...'));
      }
      await this.updateGitignoreIfNeeded(result, options.verbose);

      // Step 5: Validate repositories
      if (options.verbose) {
        console.log(chalk.gray('   Validating repositories...'));
      }
      await this.validateRepositories(result, options.verbose);

      // Display results
      this.displayCleanupResults(result);

      const hasIssues = result.issues.length > 0;

      return {
        success: !hasIssues,
        message: hasIssues
          ? `Cleanup completed with ${result.issues.length} issue(s)`
          : 'Cleanup completed successfully',
        data: result,
        exitCode: hasIssues ? 1 : 0,
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
        message: 'Failed to complete cleanup',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Validate that the environment is ready for cleanup
   */
  private async validateEnvironment(): Promise<void> {
    // Check if private git tracking is initialized
    if (!(await this.configManager.exists())) {
      throw new NotInitializedError(
        'Private git tracking is not initialized. Run "private init" first.',
      );
    }
  }

  /**
   * Validate and repair configuration
   */
  private async validateAndRepairConfig(result: CleanupResult, verbose?: boolean): Promise<void> {
    try {
      const health = await this.configManager.getHealth();

      if (!health.valid) {
        result.issues.push('Configuration validation failed');
        result.issues.push(...health.errors);
      } else {
        result.configValidated = true;
        if (verbose) {
          console.log(chalk.green('     ✓ Configuration is valid'));
        }
      }

      if (health.needsMigration) {
        result.warnings.push(
          `Configuration needs migration from ${health.currentVersion} to ${health.targetVersion}`,
        );
      }
    } catch (error) {
      result.issues.push(
        `Configuration validation error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Repair broken symbolic links
   */
  private async repairSymbolicLinks(result: CleanupResult, verbose?: boolean): Promise<void> {
    try {
      const config = await this.configManager.load();
      const storagePath = path.join(this.workingDir, config.storagePath);

      for (const trackedPath of config.trackedPaths) {
        const linkPath = path.join(this.workingDir, trackedPath);
        const targetPath = path.join(storagePath, trackedPath);

        const linkInfo = await this.symlinkService.validate(linkPath);

        if (!linkInfo.isHealthy) {
          if (verbose) {
            console.log(chalk.yellow(`     Repairing broken symlink: ${trackedPath}`));
          }

          try {
            await this.symlinkService.repair(linkPath, targetPath);
            result.repairedSymlinks++;

            if (verbose) {
              console.log(chalk.green(`       ✓ Repaired: ${trackedPath}`));
            }
          } catch (repairError) {
            result.issues.push(
              `Failed to repair symlink ${trackedPath}: ${repairError instanceof Error ? repairError.message : String(repairError)}`,
            );
          }
        } else if (verbose) {
          console.log(chalk.green(`     ✓ Healthy symlink: ${trackedPath}`));
        }
      }
    } catch (error) {
      result.issues.push(
        `Symlink repair error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clean up git index issues
   */
  private async cleanupGitIndex(
    result: CleanupResult,
    force: boolean,
    verbose?: boolean,
  ): Promise<void> {
    try {
      const gitService = new GitService(this.workingDir, this.fileSystem);

      if (await gitService.isRepository()) {
        const config = await this.configManager.load();

        // Check for tracked files that should be private
        const trackedPrivateFiles: string[] = [];

        for (const trackedPath of config.trackedPaths) {
          const isTracked = await gitService.isTracked(trackedPath);
          if (isTracked) {
            trackedPrivateFiles.push(trackedPath);
          }
        }

        if (trackedPrivateFiles.length > 0) {
          if (force) {
            if (verbose) {
              console.log(
                chalk.yellow(
                  `     Removing ${trackedPrivateFiles.length} private file(s) from git index...`,
                ),
              );
            }

            await gitService.removeFromIndex(trackedPrivateFiles, true);
            result.cleanedIndexEntries = trackedPrivateFiles.length;

            if (verbose) {
              console.log(
                chalk.green(
                  `       ✓ Removed ${trackedPrivateFiles.length} file(s) from git index`,
                ),
              );
            }
          } else {
            result.warnings.push(
              `Found ${trackedPrivateFiles.length} private file(s) in git index. Use --force to remove them.`,
            );
          }
        } else if (verbose) {
          console.log(chalk.green('     ✓ No private files found in git index'));
        }
      }
    } catch (error) {
      result.issues.push(
        `Git index cleanup error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update .gitignore if needed
   */
  private async updateGitignoreIfNeeded(result: CleanupResult, verbose?: boolean): Promise<void> {
    try {
      const gitignorePath = path.join(this.workingDir, '.gitignore');
      const requiredEntries = [
        '# Private Git Tracking (auto-generated)',
        '.git-private',
        '.private-storage',
        '.private-config.json',
      ];

      let gitignoreContent = '';
      let needsUpdate = false;

      if (await this.fileSystem.pathExists(gitignorePath)) {
        gitignoreContent = await this.fileSystem.readFile(gitignorePath);
      } else {
        needsUpdate = true;
      }

      // Check if all required entries are present
      for (const entry of requiredEntries) {
        if (!gitignoreContent.includes(entry)) {
          needsUpdate = true;
          break;
        }
      }

      if (needsUpdate) {
        if (verbose) {
          console.log(chalk.yellow('     Updating .gitignore...'));
        }

        const newContent =
          gitignoreContent.trim() +
          (gitignoreContent.trim() ? '\n\n' : '') +
          requiredEntries.join('\n') +
          '\n';

        await this.fileSystem.writeFileAtomic(gitignorePath, newContent);
        result.updatedGitignore = true;

        if (verbose) {
          console.log(chalk.green('       ✓ Updated .gitignore'));
        }
      } else if (verbose) {
        console.log(chalk.green('     ✓ .gitignore is up to date'));
      }
    } catch (error) {
      result.issues.push(
        `Gitignore update error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate repositories
   */
  private async validateRepositories(result: CleanupResult, verbose?: boolean): Promise<void> {
    try {
      // Validate main repository
      const mainGitService = new GitService(this.workingDir, this.fileSystem);
      if (await mainGitService.isRepository()) {
        const mainHealth = await mainGitService.checkRepositoryHealth();
        if (!mainHealth.isHealthy) {
          result.warnings.push('Main repository health issues detected');
          result.warnings.push(...mainHealth.issues);
        } else if (verbose) {
          console.log(chalk.green('     ✓ Main repository is healthy'));
        }
      }

      // Validate private repository
      const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
      if (await this.fileSystem.pathExists(storagePath)) {
        const privateGitService = new GitService(storagePath, this.fileSystem);
        if (await privateGitService.isRepository()) {
          const privateHealth = await privateGitService.checkRepositoryHealth();
          if (!privateHealth.isHealthy) {
            result.issues.push('Private repository health issues detected');
            result.issues.push(...privateHealth.issues);
          } else if (verbose) {
            console.log(chalk.green('     ✓ Private repository is healthy'));
          }
        } else {
          result.issues.push('Private storage is not a git repository');
        }
      } else {
        result.issues.push('Private storage directory does not exist');
      }
    } catch (error) {
      result.issues.push(
        `Repository validation error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Display cleanup results
   */
  private displayCleanupResults(result: CleanupResult): void {
    console.log();
    console.log(chalk.blue.bold('🧹 Cleanup Results'));

    if (result.repairedSymlinks > 0) {
      console.log(`   ${chalk.green('✓')} Repaired ${result.repairedSymlinks} symbolic link(s)`);
    }

    if (result.cleanedIndexEntries > 0) {
      console.log(`   ${chalk.green('✓')} Cleaned ${result.cleanedIndexEntries} git index entries`);
    }

    if (result.updatedGitignore) {
      console.log(`   ${chalk.green('✓')} Updated .gitignore`);
    }

    if (result.configValidated) {
      console.log(`   ${chalk.green('✓')} Configuration validated`);
    }

    if (result.warnings.length > 0) {
      console.log();
      console.log(chalk.yellow.bold('⚠️  Warnings:'));
      for (const warning of result.warnings) {
        console.log(`   ${chalk.yellow('•')} ${warning}`);
      }
    }

    if (result.issues.length > 0) {
      console.log();
      console.log(chalk.red.bold('❌ Issues:'));
      for (const issue of result.issues) {
        console.log(`   ${chalk.red('•')} ${issue}`);
      }
    }

    if (result.issues.length === 0 && result.warnings.length === 0) {
      console.log(`   ${chalk.green('✓')} No issues found`);
    }
  }
}
