import * as path from 'path';
import chalk from 'chalk';
import {
  CommandResult,
  CommandOptions,
  DEFAULT_PATHS,
  PrivateConfig,
  DEFAULT_SETTINGS,
  DEFAULT_GIT_EXCLUDE_SETTINGS,
  CURRENT_CONFIG_VERSION,
} from '../types/config.types';
import { ConfigManager } from '../core/config.manager';
import { FileSystemService } from '../core/filesystem.service';
import { GitService } from '../core/git.service';
import { SymlinkService } from '../core/symlink.service';
import { BaseError } from '../errors/base.error';
import { GitExcludeError } from '../errors/git.error';
import { InputValidator } from '../utils/input.validator';
import { PathNotFoundError, UnsafePathError, InvalidInputError } from '../errors/specific.errors';
import { GitFileState, LegacyGitFileState } from '../types/git.types';

/**
 * Multi-path validation result interface
 */
export interface MultiPathValidationResult {
  validPaths: string[];
  invalidPaths: Array<{ path: string; error: string }>;
  normalizedPaths: string[];
  alreadyTracked: string[];
}

/**
 * Add command specific errors
 */
export class AddError extends BaseError {
  public readonly code = 'ADD_ERROR';
  public readonly recoverable = true;
}

export class AlreadyTrackedError extends BaseError {
  public readonly code = 'ALREADY_TRACKED';
  public readonly recoverable = false;
}

export class NotInitializedError extends BaseError {
  public readonly code = 'NOT_INITIALIZED';
  public readonly recoverable = false;
}

/**
 * Batch operation specific errors
 */
export class BatchOperationError extends BaseError {
  public readonly code = 'BATCH_OPERATION_ERROR';
  public readonly recoverable = true;
  public readonly failedPaths: string[];
  public readonly successfulPaths: string[];

  constructor(message: string, failedPaths: string[] = [], successfulPaths: string[] = []) {
    super(message);
    this.failedPaths = failedPaths;
    this.successfulPaths = successfulPaths;
  }
}

export class PartialSuccessError extends BaseError {
  public readonly code = 'PARTIAL_SUCCESS';
  public readonly recoverable = false;
  public readonly processedPaths: string[];
  public readonly remainingPaths: string[];

  constructor(message: string, processedPaths: string[] = [], remainingPaths: string[] = []) {
    super(message);
    this.processedPaths = processedPaths;
    this.remainingPaths = remainingPaths;
  }
}

/**
 * Add command for tracking files in private repository
 */
export class AddCommand {
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
   * Create GitService instance with current configuration
   */
  private async createGitService(workingDir?: string): Promise<GitService> {
    try {
      const config = await this.configManager.load();
      return new GitService(
        workingDir || this.workingDir,
        this.fileSystem,
        config.settings.gitExclude,
      );
    } catch {
      // If config loading fails, use default settings
      return new GitService(workingDir || this.workingDir, this.fileSystem);
    }
  }

  /**
   * Execute the add command for single or multiple files
   */
  public async execute(
    filePaths: string | string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    try {
      // Handle both single and multiple file inputs
      const pathsArray = Array.isArray(filePaths) ? filePaths : [filePaths];

      // Limit the number of files that can be processed in a single batch
      const MAX_BATCH_SIZE = 100;
      if (pathsArray.length > MAX_BATCH_SIZE) {
        throw new AddError(
          `Cannot process more than ${MAX_BATCH_SIZE} files in a single operation. Please split your request into smaller batches.`,
        );
      }

      if (options.verbose) {
        if (pathsArray.length === 1) {
          console.log(chalk.blue(`🔄 Adding ${pathsArray[0]} to private tracking...`));
        } else {
          console.log(chalk.blue(`🔄 Adding ${pathsArray.length} files to private tracking...`));
        }
      }

      // Validate environment
      await this.validateEnvironment();

      // Validate and process multiple paths
      const validationResult = await this.validateAndNormalizeMultiplePaths(pathsArray);

      // Check for validation errors
      if (validationResult.invalidPaths.length > 0) {
        const errorMessages = validationResult.invalidPaths
          .map(item => `${item.path}: ${item.error}`)
          .join('\n');

        if (pathsArray.length === 1) {
          throw new InvalidInputError(`Invalid path detected:\n${errorMessages}`);
        } else {
          throw new BatchOperationError(
            `Invalid paths detected in batch operation:\n${errorMessages}`,
            validationResult.invalidPaths.map(item => item.path),
            validationResult.validPaths,
          );
        }
      }

      // Check for already tracked paths
      if (validationResult.alreadyTracked.length > 0) {
        if (pathsArray.length === 1) {
          throw new AlreadyTrackedError(
            `Path is already tracked: ${validationResult.alreadyTracked[0]}`,
          );
        } else {
          throw new BatchOperationError(
            `The following paths are already tracked: ${validationResult.alreadyTracked.join(', ')}`,
            validationResult.alreadyTracked,
            validationResult.validPaths,
          );
        }
      }

      // Execute the add operation atomically for all files
      await this.executeMultipleAddOperation(validationResult.normalizedPaths, options);

      const successMessage =
        pathsArray.length === 1
          ? `Successfully added ${validationResult.normalizedPaths[0]} to private tracking`
          : `Successfully added ${validationResult.normalizedPaths.length} files to private tracking`;

      return {
        success: true,
        message: successMessage,
        exitCode: 0,
      };
    } catch (error) {
      // Special handling for GitExcludeError with 'error' fallback behavior
      // These should cause the command to fail by throwing, not returning a failure result
      if (
        error instanceof GitExcludeError &&
        error.message.includes('Git exclude operations are disabled')
      ) {
        throw error; // Re-throw to fail the entire command with rejection
      }

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
        message: 'Failed to add files to private tracking',
        error: error instanceof Error ? error : new Error(String(error)),
        exitCode: 1,
      };
    }
  }

  /**
   * Validate that the environment is ready for add operation
   */
  private async validateEnvironment(): Promise<void> {
    // Check if private storage directory exists first (indicates pgit was initialized)
    const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
    const storageExists = await this.fileSystem.pathExists(storagePath);

    // Check if config file exists
    const configExists = await this.configManager.exists();

    // If neither config nor storage exists, pgit is not initialized
    if (!configExists && !storageExists) {
      throw new NotInitializedError(
        'Private git tracking is not initialized. Run "private init" first.',
      );
    }

    // If storage exists but config is missing/corrupted, we can fall back to defaults
    // This provides resilience against config file corruption
    if (!configExists && storageExists) {
      console.warn('Warning: Configuration file is missing or corrupted. Using default settings.');
    }

    // Check if symbolic links are supported
    if (!(await SymlinkService.supportsSymlinks())) {
      throw new AddError(
        'This platform does not support symbolic links, which are required for private file tracking.',
      );
    }

    // Ensure private storage directory exists (create if missing)
    if (!storageExists) {
      throw new AddError(
        'Private storage directory does not exist. The initialization may have failed.',
      );
    }
  }

  /**
   * Validate and normalize multiple file paths
   */
  private async validateAndNormalizeMultiplePaths(
    filePaths: string[],
  ): Promise<MultiPathValidationResult> {
    const result: MultiPathValidationResult = {
      validPaths: [],
      invalidPaths: [],
      normalizedPaths: [],
      alreadyTracked: [],
    };

    // Remove duplicates while preserving order
    const uniquePaths = [...new Set(filePaths)];

    // Load config once for efficiency, with fallback for corrupted config
    let config: PrivateConfig;
    try {
      config = await this.configManager.load();
    } catch {
      // If config loading fails, create a minimal fallback config
      console.warn('Warning: Could not load configuration. Using default settings for validation.');
      config = {
        version: CURRENT_CONFIG_VERSION,
        privateRepoPath: DEFAULT_PATHS.privateRepo,
        storagePath: DEFAULT_PATHS.storage,
        trackedPaths: [], // Empty tracked paths as fallback
        initialized: new Date(),
        settings: {
          ...DEFAULT_SETTINGS,
          gitExclude: { ...DEFAULT_GIT_EXCLUDE_SETTINGS },
        },
        metadata: {
          projectName: 'unknown',
          mainRepoPath: this.workingDir,
          cliVersion: CURRENT_CONFIG_VERSION,
          platform: 'unknown',
          lastModified: new Date(),
        },
      };
    }

    for (const filePath of uniquePaths) {
      try {
        // Validate individual path
        const normalizedPath = await this.validateAndNormalizePath(filePath);

        // Check if already tracked
        if (config.trackedPaths.includes(normalizedPath)) {
          result.alreadyTracked.push(normalizedPath);
        } else {
          result.validPaths.push(filePath);
          result.normalizedPaths.push(normalizedPath);
        }
      } catch (error) {
        result.invalidPaths.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Validate and normalize a single file path
   */
  private async validateAndNormalizePath(filePath: string): Promise<string> {
    // Input validation with security checks
    const validation = InputValidator.validatePath(filePath, {
      allowAbsolutePaths: false,
      allowParentDirectory: false,
      maxPathLength: 255,
    });

    if (!validation.isValid) {
      if (validation.securityRisk) {
        throw new UnsafePathError(filePath, validation.issues.join(', '));
      } else {
        throw new InvalidInputError(`Invalid path: ${validation.issues.join(', ')}`);
      }
    }

    // Create safe absolute path
    const safePath = InputValidator.createSafePath(this.workingDir, validation.normalizedPath);

    // Check if file/directory exists
    if (!(await this.fileSystem.pathExists(safePath))) {
      throw new PathNotFoundError(`Path does not exist: ${filePath}`);
    }

    // Convert back to relative path for storage
    const relativePath = path.relative(this.workingDir, safePath);

    return relativePath;
  }

  /**
   * Get the current git state of a file (legacy version for backward compatibility)
   * @deprecated Use getEnhancedFileGitState instead
   */
  // @ts-ignore - Method kept for backward compatibility
  private async getFileGitState(relativePath: string): Promise<LegacyGitFileState> {
    try {
      const gitService = await this.createGitService();
      const enhancedState = await gitService.getFileGitState(relativePath);

      // Return legacy format for backward compatibility
      return {
        isTracked: enhancedState.isTracked,
        isStaged: enhancedState.isStaged,
      };
    } catch {
      return { isTracked: false, isStaged: false };
    }
  }

  /**
   * Get enhanced git state of a file including exclude status
   * TODO: This method will be used in future tasks for enhanced git removal functionality
   */
  // @ts-ignore - Method will be used in future tasks
  private async getEnhancedFileGitState(relativePath: string): Promise<GitFileState> {
    try {
      const gitService = await this.createGitService();
      return await gitService.getFileGitState(relativePath);
    } catch {
      // Return default state on error
      return {
        isTracked: false,
        isStaged: false,
        isModified: false,
        isUntracked: false,
        isExcluded: false,
        originalPath: relativePath,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute atomic add operation for multiple files with enhanced git removal
   */
  private async executeMultipleAddOperation(
    relativePaths: string[],
    options: CommandOptions,
  ): Promise<void> {
    if (relativePaths.length === 0) {
      throw new AddError('No valid paths to process');
    }

    if (relativePaths.length === 1) {
      // Use the existing single file operation for single files
      return this.executeAddOperation(relativePaths[0], options);
    }

    // For multiple files, implement atomic batch operation with enhanced git removal
    // Performance optimization: chunk large batches to prevent memory issues and improve performance
    const OPTIMAL_BATCH_SIZE = 50; // Optimal batch size for git operations

    if (relativePaths.length > OPTIMAL_BATCH_SIZE) {
      if (options.verbose) {
        console.log(
          chalk.gray(
            `   Large batch detected (${relativePaths.length} files), processing in chunks for optimal performance...`,
          ),
        );
      }

      // Process in chunks for better performance
      const chunks = this.chunkArray(relativePaths, OPTIMAL_BATCH_SIZE);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (options.verbose) {
          console.log(
            chalk.gray(`   Processing chunk ${i + 1}/${chunks.length} (${chunk.length} files)...`),
          );
        }
        await this.executeMultipleAddOperation(chunk, { ...options, verbose: false }); // Reduce verbosity for chunks
      }

      if (options.verbose) {
        console.log(
          chalk.green(
            `   ✓ Successfully processed all ${relativePaths.length} files in ${chunks.length} chunks`,
          ),
        );
      }
      return;
    }

    const rollbackActions: Array<() => Promise<void>> = [];
    const processedPaths: string[] = [];
    const originalGitStates = new Map<string, GitFileState>();

    try {
      if (options.verbose) {
        console.log(chalk.gray(`   Processing ${relativePaths.length} files atomically...`));
      }

      // Step 1: Record original git states and exclude file state for all files
      if (options.verbose) {
        console.log(chalk.gray('   Recording original git states...'));
      }

      const mainGitService = await this.createGitService();
      let isGitRepo = false;
      let originalExcludeFileContent = '';

      if (await mainGitService.isRepository()) {
        isGitRepo = true;
        // Record original exclude file content for rollback
        originalExcludeFileContent = await mainGitService.readGitExcludeFile();
      }

      const gitService = await this.createGitService();
      for (const relativePath of relativePaths) {
        const originalState = await gitService.recordOriginalState(relativePath);
        originalGitStates.set(relativePath, originalState);
      }

      // Step 2: Enhanced batch git removal with exclude operations using optimized batch processing
      if (options.verbose) {
        console.log(chalk.gray('   Removing files from main git index and adding to exclude...'));
      }

      let batchGitResult: {
        successful: string[];
        failed: Array<{ path: string; error: string }>;
        originalStates: Map<string, GitFileState>;
      } | null = null;

      if (isGitRepo) {
        // Use optimized batch git removal
        batchGitResult = await this.batchRemoveFromMainGitIndex(relativePaths, {
          verbose: options.verbose,
        });

        // Check for any failures in git operations
        if (batchGitResult.failed.length > 0) {
          const failedPaths = batchGitResult.failed.map(f => f.path);
          const errorMessages = batchGitResult.failed.map(f => `${f.path}: ${f.error}`).join('\n');

          console.warn(
            chalk.yellow(
              `   Warning: Some git operations failed for ${failedPaths.length} files:\n${errorMessages}`,
            ),
          );
        }

        if (batchGitResult.successful.length > 0) {
          processedPaths.push(...batchGitResult.successful);
          if (options.verbose) {
            console.log(
              chalk.gray(
                `     Successfully processed ${batchGitResult.successful.length} files for git operations`,
              ),
            );
          }
        }

        // Add optimized rollback for git operations using batch restore
        rollbackActions.push(async () => {
          if (batchGitResult && batchGitResult.originalStates.size > 0) {
            const rollbackResult = await this.batchRestoreToEnhancedGitState(
              batchGitResult.originalStates,
              originalExcludeFileContent,
              { verbose: options.verbose },
            );

            if (rollbackResult.failed.length > 0) {
              console.warn(
                chalk.yellow(
                  `   Warning: Git rollback failed for ${rollbackResult.failed.length} files: ${rollbackResult.failed.map(f => f.path).join(', ')}`,
                ),
              );
            }
          }
        });
      } else {
        // Not a git repository, skip git operations but still track processed paths
        processedPaths.push(...relativePaths);
      }

      // Step 3: Move all files to private storage
      if (options.verbose) {
        console.log(chalk.gray('   Moving files to private storage...'));
      }

      const movedFiles: string[] = [];
      for (const relativePath of relativePaths) {
        const originalPath = path.join(this.workingDir, relativePath);
        const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage, relativePath);

        await this.fileSystem.moveFileAtomic(originalPath, storagePath);
        this.fileSystem.clearRollbackActions();
        movedFiles.push(relativePath);
      }

      // Add rollback for file moves
      rollbackActions.push(async () => {
        for (const relativePath of movedFiles.reverse()) {
          const originalPath = path.join(this.workingDir, relativePath);
          const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage, relativePath);

          if (await this.fileSystem.pathExists(storagePath)) {
            if (await this.fileSystem.pathExists(originalPath)) {
              await this.fileSystem.remove(originalPath);
            }
            await this.fileSystem.moveFileAtomic(storagePath, originalPath);
            this.fileSystem.clearRollbackActions();
          }
        }
      });

      // Step 4: Create all symbolic links
      if (options.verbose) {
        console.log(chalk.gray('   Creating symbolic links...'));
      }

      const createdLinks: string[] = [];
      for (const relativePath of relativePaths) {
        const originalPath = path.join(this.workingDir, relativePath);
        const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage, relativePath);

        const isDirectory = await this.fileSystem.isDirectory(storagePath);
        await this.symlinkService.create(storagePath, originalPath, {
          force: true,
          createParents: true,
          isDirectory,
        });
        createdLinks.push(relativePath);
      }

      // Add rollback for symbolic links
      rollbackActions.push(async () => {
        for (const relativePath of createdLinks.reverse()) {
          const originalPath = path.join(this.workingDir, relativePath);
          await this.symlinkService.remove(originalPath);
        }
      });

      // Step 5: Add all files to private git repository and commit in one transaction
      if (options.verbose) {
        console.log(chalk.gray('   Adding files to private git repository...'));
      }

      const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
      const privateGitService = await this.createGitService(privateStoragePath);

      if (!(await privateGitService.isRepository())) {
        throw new AddError('Private git repository not found. The initialization may have failed.');
      }

      // Use the new atomic commit method
      const commitHash = await privateGitService.addFilesAndCommit(
        relativePaths,
        'Add files to private tracking',
      );

      // Add rollback for git operations
      rollbackActions.push(async () => {
        try {
          // Reset the private repository to before the commit
          await privateGitService.reset('hard', 'HEAD~1');
        } catch {
          // If reset fails, try to remove files individually
          await privateGitService.removeFromIndex(relativePaths, false);
        }
      });

      // Step 6: Update configuration with all paths
      if (options.verbose) {
        console.log(chalk.gray('   Updating configuration...'));
      }

      await this.configManager.addMultipleTrackedPaths(relativePaths);

      // Add rollback for configuration
      rollbackActions.push(async () => {
        try {
          await this.configManager.removeMultipleTrackedPaths(relativePaths);
        } catch {
          // Ignore errors during rollback
        }
      });

      if (options.verbose) {
        console.log(
          chalk.green(`   ✓ Successfully added ${relativePaths.length} files to private tracking`),
        );
        console.log(chalk.gray(`   Commit hash: ${commitHash}`));
      }
    } catch (error) {
      // Execute rollback in reverse order
      if (options.verbose) {
        console.log(chalk.yellow('   Rolling back changes due to error...'));
      }

      for (const rollbackAction of rollbackActions.reverse()) {
        try {
          await rollbackAction();
        } catch (rollbackError) {
          // Log rollback errors but don't throw to avoid masking original error
          console.error(
            chalk.red(
              `   Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            ),
          );
        }
      }

      throw error;
    }
  }

  /**
   * Execute the complete add operation atomically for a single file
   */
  private async executeAddOperation(relativePath: string, options: CommandOptions): Promise<void> {
    const originalPath = path.join(this.workingDir, relativePath);
    const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage, relativePath);

    // Store rollback actions
    const rollbackActions: Array<() => Promise<void>> = [];

    try {
      if (options.verbose) {
        console.log(chalk.gray('   Removing from main git index...'));
      }

      // Step 1: Use enhanced batch git removal logic for consistency (Requirements 7.1, 7.2)
      // This ensures single file operations follow the same logic as batch operations
      const batchGitResult = await this.batchRemoveFromMainGitIndex([relativePath], {
        verbose: options.verbose,
      });

      // Record original exclude file content for rollback
      const gitService = await this.createGitService();
      let originalExcludeContent = '';
      if (await gitService.isRepository()) {
        originalExcludeContent = await gitService.readGitExcludeFile();
      }

      // Handle git operation results with consistent error handling
      if (batchGitResult.failed.length > 0) {
        const failedResult = batchGitResult.failed[0];
        console.warn(
          chalk.yellow(
            `   Warning: Git operation failed for ${failedResult.path}: ${failedResult.error}`,
          ),
        );
      }

      // Add enhanced rollback for git operations using batch restore
      rollbackActions.push(async () => {
        if (batchGitResult.originalStates.size > 0) {
          const rollbackResult = await this.batchRestoreToEnhancedGitState(
            batchGitResult.originalStates,
            originalExcludeContent,
            { verbose: options.verbose },
          );

          if (rollbackResult.failed.length > 0) {
            console.warn(
              chalk.yellow(
                `   Warning: Git rollback failed for ${rollbackResult.failed[0].path}: ${rollbackResult.failed[0].error}`,
              ),
            );
          }
        }
      });

      if (options.verbose) {
        console.log(chalk.gray('   Moving file to private storage...'));
      }

      // Step 2: Move file to private storage
      await this.fileSystem.moveFileAtomic(originalPath, storagePath);
      // Clear the FileSystemService rollback actions since we'll handle rollback ourselves
      this.fileSystem.clearRollbackActions();
      rollbackActions.push(async () => {
        // Move back to original location
        if (await this.fileSystem.pathExists(storagePath)) {
          // Remove symlink first if it exists
          if (await this.fileSystem.pathExists(originalPath)) {
            await this.fileSystem.remove(originalPath);
          }
          await this.fileSystem.moveFileAtomic(storagePath, originalPath);
          this.fileSystem.clearRollbackActions();
        }
      });

      if (options.verbose) {
        console.log(chalk.gray('   Creating symbolic link...'));
        console.log(chalk.gray(`     Target: ${storagePath}`));
        console.log(chalk.gray(`     Link: ${originalPath}`));
        console.log(
          chalk.gray(`     Target exists: ${await this.fileSystem.pathExists(storagePath)}`),
        );
        console.log(
          chalk.gray(`     Link exists: ${await this.fileSystem.pathExists(originalPath)}`),
        );
      }

      // Step 3: Create symbolic link
      const isDirectory = await this.fileSystem.isDirectory(storagePath);
      await this.symlinkService.create(storagePath, originalPath, {
        force: true,
        createParents: true,
        isDirectory,
      });
      rollbackActions.push(async () => {
        // Remove symbolic link
        await this.symlinkService.remove(originalPath);
      });

      if (options.verbose) {
        console.log(chalk.gray('   Adding to private git repository...'));
      }

      // Step 4: Add to private git repository
      await this.addToPrivateGit(relativePath);
      rollbackActions.push(async () => {
        // Remove from private git
        await this.removeFromPrivateGit(relativePath);
      });

      if (options.verbose) {
        console.log(chalk.gray('   Updating configuration...'));
      }

      // Step 5: Update configuration (skip if config is corrupted)
      try {
        await this.configManager.addTrackedPath(relativePath);
        rollbackActions.push(async () => {
          // Remove from tracked paths
          try {
            await this.configManager.removeTrackedPath(relativePath);
          } catch {
            // Ignore errors during rollback
          }
        });
      } catch {
        // If config is corrupted, log warning but continue
        console.warn(
          chalk.yellow(
            `   Warning: Could not update configuration for ${relativePath}. File tracking will still work, but may not persist after restart.`,
          ),
        );
        // Add a no-op rollback action for consistency
        rollbackActions.push(async () => {
          // No-op since config update failed
        });
      }

      if (options.verbose) {
        console.log(chalk.gray('   Committing to private repository...'));
      }

      // Step 6: Commit to private repository
      await this.commitToPrivateGit(relativePath, 'Add file to private tracking');

      if (options.verbose) {
        console.log(chalk.green('   ✓ File successfully added to private tracking'));
      }
    } catch (error) {
      // Execute rollback in reverse order
      if (options.verbose) {
        console.log(chalk.yellow('   Rolling back changes due to error...'));
      }

      for (const rollbackAction of rollbackActions.reverse()) {
        try {
          await rollbackAction();
        } catch (rollbackError) {
          // Log rollback errors but don't throw to avoid masking original error
          console.error(
            chalk.red(
              `   Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            ),
          );
        }
      }

      throw error;
    }
  }

  /**
   * Remove file from main git index and add to git exclude
   * @deprecated Use batchRemoveFromMainGitIndex for consistency with enhanced logic
   */
  // @ts-ignore - Method kept for backward compatibility
  private async removeFromMainGitIndex(relativePath: string): Promise<void> {
    try {
      const gitService = await this.createGitService();

      if (await gitService.isRepository()) {
        // Always attempt to remove from git index regardless of current state
        // This handles tracked, staged, and untracked files consistently
        try {
          await gitService.removeFromIndex(relativePath, true);
        } catch (removeError) {
          // Log warning but continue - file might not be in index
          console.warn(
            chalk.yellow(
              `   Warning: Could not remove ${relativePath} from git index: ${removeError instanceof Error ? removeError.message : String(removeError)}`,
            ),
          );
        }

        // Add to .git/info/exclude to prevent future git add operations
        // The new addToGitExclude method handles errors gracefully and logs warnings internally
        await gitService.addToGitExclude(relativePath);
      }
    } catch (error) {
      // If repository check fails, log warning but continue
      console.warn(
        chalk.yellow(
          `   Warning: Could not process git operations for ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Remove multiple files from main git index and add to git exclude in batch
   * Optimized for performance with large file batches
   */
  private async batchRemoveFromMainGitIndex(
    relativePaths: string[],
    options: { verbose?: boolean } = {},
  ): Promise<{
    successful: string[];
    failed: Array<{ path: string; error: string }>;
    originalStates: Map<string, GitFileState>;
  }> {
    const result = {
      successful: [] as string[],
      failed: [] as Array<{ path: string; error: string }>,
      originalStates: new Map<string, GitFileState>(),
    };

    if (relativePaths.length === 0) {
      return result;
    }

    try {
      const gitService = await this.createGitService();

      if (!(await gitService.isRepository())) {
        // Not a git repository, skip git operations
        return result;
      }

      // Step 1: Record original states for all files
      if (options.verbose) {
        console.log(chalk.gray(`     Recording git states for ${relativePaths.length} files...`));
      }

      for (const relativePath of relativePaths) {
        try {
          const originalState = await gitService.recordOriginalState(relativePath);
          result.originalStates.set(relativePath, originalState);
        } catch (error) {
          result.failed.push({
            path: relativePath,
            error: `Failed to record git state: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      // Step 2: Batch remove from git index (only files that are tracked/staged)
      const filesToRemove = relativePaths.filter(path => {
        const state = result.originalStates.get(path);
        return state && (state.isTracked || state.isStaged);
      });

      if (filesToRemove.length > 0) {
        if (options.verbose) {
          console.log(chalk.gray(`     Removing ${filesToRemove.length} files from git index...`));
        }

        try {
          await gitService.removeFromIndex(filesToRemove, true);
          result.successful.push(...filesToRemove);
        } catch {
          // If batch removal fails, try individual removals
          if (options.verbose) {
            console.log(chalk.gray('     Batch removal failed, trying individual removals...'));
          }

          for (const relativePath of filesToRemove) {
            try {
              await gitService.removeFromIndex(relativePath, true);
              result.successful.push(relativePath);
            } catch (individualError) {
              result.failed.push({
                path: relativePath,
                error: `Failed to remove from git index: ${individualError instanceof Error ? individualError.message : String(individualError)}`,
              });
            }
          }
        }
      }

      // Step 3: Batch add to .git/info/exclude with enhanced error handling
      if (options.verbose) {
        console.log(
          chalk.gray(`     Adding ${relativePaths.length} files to .git/info/exclude...`),
        );
      }

      const excludeResult = await gitService.addMultipleToGitExclude(relativePaths);

      // Mark successful exclude operations
      for (const successfulPath of excludeResult.successful) {
        if (!result.successful.includes(successfulPath)) {
          result.successful.push(successfulPath);
        }
      }

      // Handle exclude operation failures gracefully
      if (excludeResult.failed.length > 0) {
        if (options.verbose) {
          console.log(
            chalk.gray(
              `     ${excludeResult.failed.length} exclude operations failed, handling gracefully...`,
            ),
          );
        }

        for (const failedExclude of excludeResult.failed) {
          // Only add to failed if not already successful from git removal
          if (!result.successful.includes(failedExclude.path)) {
            result.failed.push({
              path: failedExclude.path,
              error: `Failed to add to .git/info/exclude: ${failedExclude.error}`,
            });
          } else {
            // Log warning but don't fail since git removal succeeded
            console.warn(
              chalk.yellow(
                `   Warning: Could not add ${failedExclude.path} to .git/info/exclude: ${failedExclude.error}`,
              ),
            );
          }
        }
      }
    } catch (error) {
      // Check if this is a GitExcludeError with 'error' fallback behavior
      // These should propagate up to fail the entire command, not be treated as graceful failures
      if (
        error instanceof GitExcludeError &&
        error.message.includes('Git exclude operations are disabled')
      ) {
        throw error; // Re-throw to fail the entire command
      }

      // Repository-level error, mark all files as failed
      const errorMessage = `Git repository error: ${error instanceof Error ? error.message : String(error)}`;
      for (const relativePath of relativePaths) {
        result.failed.push({
          path: relativePath,
          error: errorMessage,
        });
      }
    }

    return result;
  }

  /**
   * Add file to private git repository
   */
  private async addToPrivateGit(relativePath: string): Promise<void> {
    const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
    const gitService = await this.createGitService(privateStoragePath);

    if (!(await gitService.isRepository())) {
      throw new AddError('Private git repository not found. The initialization may have failed.');
    }

    await gitService.addFiles([relativePath]);
  }

  /**
   * Commit changes to private git repository
   */
  private async commitToPrivateGit(relativePath: string, message: string): Promise<void> {
    const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
    const gitService = await this.createGitService(privateStoragePath);

    await gitService.commit(`${message}: ${relativePath}`);
  }

  /**
   * Remove file from private git repository (for rollback)
   */
  private async removeFromPrivateGit(relativePath: string): Promise<void> {
    try {
      const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
      const gitService = await this.createGitService(privateStoragePath);

      await gitService.removeFromIndex(relativePath, false);
    } catch {
      // Ignore errors during rollback
    }
  }

  /**
   * Restore file to its original git state (for rollback) - Legacy version for backward compatibility
   * @deprecated Use restoreToEnhancedGitState instead
   */
  // @ts-ignore - Method kept for backward compatibility
  private async restoreToOriginalGitState(
    relativePath: string,
    originalState: { isTracked: boolean; isStaged: boolean },
  ): Promise<void> {
    try {
      const gitService = await this.createGitService();

      if (!(await gitService.isRepository())) {
        return; // Nothing to restore in non-git directories
      }

      if (originalState.isTracked && originalState.isStaged) {
        // File was previously staged, add it back to staging
        await gitService.addFiles([relativePath]);
      } else if (originalState.isTracked && !originalState.isStaged) {
        // File was tracked but not staged, add then unstage to get it back in index but not staged
        await gitService.addFiles([relativePath]);
        await gitService.removeFromIndex(relativePath, true); // Remove from staging but keep in index
      }
      // If originalState.isTracked is false, file was untracked - do nothing (leave it untracked)
    } catch (error) {
      // Log warning but don't fail rollback
      console.warn(
        chalk.yellow(
          `   Warning: Could not restore original git state: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Enhanced rollback functionality: Restore file to its original enhanced git state including exclude status
   * @deprecated Use batchRestoreToEnhancedGitState for consistency with enhanced logic
   */
  // @ts-ignore - Method kept for backward compatibility
  private async restoreToEnhancedGitState(
    relativePath: string,
    originalState: GitFileState,
    originalExcludeContent?: string,
  ): Promise<void> {
    const rollbackErrors: string[] = [];

    try {
      const gitService = await this.createGitService();

      if (!(await gitService.isRepository())) {
        return; // Nothing to restore in non-git directories
      }

      // Step 1: Restore git index state
      try {
        if (originalState.isTracked && originalState.isStaged) {
          // File was previously staged, add it back to staging
          await gitService.addFiles([relativePath]);
        } else if (originalState.isTracked && !originalState.isStaged) {
          // File was tracked but not staged, add then unstage to get it back in index but not staged
          await gitService.addFiles([relativePath]);
          await gitService.removeFromIndex(relativePath, true); // Remove from staging but keep in index
        }
        // If originalState.isTracked is false, file was untracked - do nothing (leave it untracked)
      } catch (gitError) {
        rollbackErrors.push(
          `Git index restoration failed: ${gitError instanceof Error ? gitError.message : String(gitError)}`,
        );
      }

      // Step 2: Restore exclude file state
      // The new exclude methods handle errors gracefully and log warnings internally
      if (originalState.isExcluded) {
        // File was originally excluded, ensure it's back in exclude file
        await gitService.addToGitExclude(relativePath);
      } else {
        // File was not originally excluded, remove it from exclude file
        await gitService.removeFromGitExclude(relativePath);
      }

      // Step 3: If we have original exclude content and there were exclude errors, try full restore
      if (
        rollbackErrors.some(error => error.includes('Exclude file')) &&
        originalExcludeContent !== undefined
      ) {
        try {
          if (originalExcludeContent.trim()) {
            await gitService.writeGitExcludeFile(originalExcludeContent);
          } else {
            // Original exclude file was empty, remove current exclude file
            const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
            if (await this.fileSystem.pathExists(gitExcludePath)) {
              await this.fileSystem.remove(gitExcludePath);
            }
          }
          // Clear exclude-related errors since we did a full restore
          const nonExcludeErrors = rollbackErrors.filter(error => !error.includes('Exclude file'));
          rollbackErrors.length = 0;
          rollbackErrors.push(...nonExcludeErrors);
        } catch (fullRestoreError) {
          rollbackErrors.push(
            `Full exclude file restoration failed: ${fullRestoreError instanceof Error ? fullRestoreError.message : String(fullRestoreError)}`,
          );
        }
      }

      // Log warnings for any rollback errors without throwing
      if (rollbackErrors.length > 0) {
        console.warn(
          chalk.yellow(
            `   Warning: Rollback issues for ${relativePath}: ${rollbackErrors.join('; ')}`,
          ),
        );
      }
    } catch (error) {
      // Log warning but don't fail rollback to avoid masking original error
      console.warn(
        chalk.yellow(
          `   Warning: Could not restore enhanced git state for ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  /**
   * Utility method to chunk an array into smaller arrays of specified size
   * Used for performance optimization with large file batches
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Enhanced batch restore multiple files to their git states including exclude file restoration
   * Optimized for performance with large file batches and proper error handling
   */
  private async batchRestoreToEnhancedGitState(
    originalStates: Map<string, GitFileState>,
    originalExcludeContent: string,
    options: { verbose?: boolean } = {},
  ): Promise<{
    successful: string[];
    failed: Array<{ path: string; error: string }>;
  }> {
    const result = {
      successful: [] as string[],
      failed: [] as Array<{ path: string; error: string }>,
    };

    if (originalStates.size === 0) {
      return result;
    }

    const rollbackErrors: string[] = [];

    try {
      const gitService = await this.createGitService();

      if (!(await gitService.isRepository())) {
        // Not a git repository, mark all as successful (nothing to restore)
        result.successful.push(...Array.from(originalStates.keys()));
        return result;
      }

      if (options.verbose) {
        console.log(chalk.gray(`     Restoring git states for ${originalStates.size} files...`));
      }

      // Step 1: Restore original exclude file content completely
      try {
        if (originalExcludeContent.trim()) {
          await gitService.writeGitExcludeFile(originalExcludeContent);
        } else {
          // Original exclude file was empty or didn't exist, remove current exclude file
          const gitExcludePath = path.join(this.workingDir, '.git', 'info', 'exclude');
          if (await this.fileSystem.pathExists(gitExcludePath)) {
            await this.fileSystem.remove(gitExcludePath);
          }
        }
        if (options.verbose) {
          console.log(chalk.gray('     Restored original .git/info/exclude content'));
        }
      } catch (excludeError) {
        rollbackErrors.push(
          `Exclude file restoration failed: ${excludeError instanceof Error ? excludeError.message : String(excludeError)}`,
        );

        // If full restore failed, try individual exclude operations as fallback
        if (options.verbose) {
          console.log(
            chalk.gray('     Full exclude restore failed, trying individual exclude operations...'),
          );
        }

        const originallyExcluded: string[] = [];
        const originallyNotExcluded: string[] = [];

        for (const [relativePath, originalState] of originalStates) {
          if (originalState.isExcluded) {
            originallyExcluded.push(relativePath);
          } else {
            originallyNotExcluded.push(relativePath);
          }
        }

        // Try to restore exclude states individually
        if (originallyExcluded.length > 0) {
          const addResult = await gitService.addMultipleToGitExclude(originallyExcluded);
          if (addResult.failed.length > 0) {
            rollbackErrors.push(
              `Failed to restore ${addResult.failed.length} excluded paths: ${addResult.failed.map(f => f.path).join(', ')}`,
            );
          }
        }

        if (originallyNotExcluded.length > 0) {
          const removeResult = await gitService.removeMultipleFromGitExclude(originallyNotExcluded);
          if (removeResult.failed.length > 0) {
            rollbackErrors.push(
              `Failed to remove ${removeResult.failed.length} paths from exclude: ${removeResult.failed.map(f => f.path).join(', ')}`,
            );
          }
        }

        if (options.verbose) {
          console.log(chalk.gray('     Individual exclude operations completed'));
        }
      }

      // Step 2: Group files by their required git operations for batch processing
      const filesToStage: string[] = [];
      const filesToTrack: string[] = [];
      const filesToLeaveUntracked: string[] = [];

      for (const [relativePath, originalState] of originalStates) {
        if (originalState.isTracked && originalState.isStaged) {
          filesToStage.push(relativePath);
        } else if (originalState.isTracked && !originalState.isStaged) {
          filesToTrack.push(relativePath);
        } else {
          // Untracked files don't need git index restoration
          filesToLeaveUntracked.push(relativePath);
        }
      }

      // Step 3: Batch restore staged files
      if (filesToStage.length > 0) {
        try {
          await gitService.addFiles(filesToStage);
          result.successful.push(...filesToStage);
          if (options.verbose) {
            console.log(chalk.gray(`     Restored ${filesToStage.length} files to staged state`));
          }
        } catch (stageError) {
          rollbackErrors.push(
            `Batch staging failed: ${stageError instanceof Error ? stageError.message : String(stageError)}`,
          );

          // If batch staging fails, try individual staging
          if (options.verbose) {
            console.log(chalk.gray('     Batch staging failed, trying individual staging...'));
          }

          for (const relativePath of filesToStage) {
            try {
              await gitService.addFiles([relativePath]);
              result.successful.push(relativePath);
            } catch (individualError) {
              result.failed.push({
                path: relativePath,
                error: `Failed to restore to staged state: ${individualError instanceof Error ? individualError.message : String(individualError)}`,
              });
            }
          }
        }
      }

      // Step 4: Batch restore tracked but unstaged files
      if (filesToTrack.length > 0) {
        try {
          // Add files first, then unstage them to get them back in index but not staged
          await gitService.addFiles(filesToTrack);
          await gitService.removeFromIndex(filesToTrack, true);
          result.successful.push(...filesToTrack);
          if (options.verbose) {
            console.log(chalk.gray(`     Restored ${filesToTrack.length} files to tracked state`));
          }
        } catch (trackError) {
          rollbackErrors.push(
            `Batch tracking failed: ${trackError instanceof Error ? trackError.message : String(trackError)}`,
          );

          // If batch tracking fails, try individual tracking
          if (options.verbose) {
            console.log(chalk.gray('     Batch tracking failed, trying individual tracking...'));
          }

          for (const relativePath of filesToTrack) {
            try {
              await gitService.addFiles([relativePath]);
              await gitService.removeFromIndex(relativePath, true);
              result.successful.push(relativePath);
            } catch (individualError) {
              result.failed.push({
                path: relativePath,
                error: `Failed to restore to tracked state: ${individualError instanceof Error ? individualError.message : String(individualError)}`,
              });
            }
          }
        }
      }

      // Step 5: Mark untracked files as successful (no git index action needed)
      result.successful.push(...filesToLeaveUntracked);
      if (options.verbose && filesToLeaveUntracked.length > 0) {
        console.log(
          chalk.gray(`     Left ${filesToLeaveUntracked.length} files in untracked state`),
        );
      }

      // Step 6: Log rollback warnings without failing the operation
      if (rollbackErrors.length > 0) {
        console.warn(
          chalk.yellow(
            `   Warning: Some rollback operations had issues: ${rollbackErrors.join('; ')}`,
          ),
        );
      }

      // Step 7: Ensure all files are accounted for
      const processedFiles = new Set([...result.successful, ...result.failed.map(f => f.path)]);
      for (const relativePath of originalStates.keys()) {
        if (!processedFiles.has(relativePath)) {
          result.successful.push(relativePath);
        }
      }
    } catch (error) {
      // Repository-level error, mark remaining files as failed but don't throw
      const errorMessage = `Git repository error during rollback: ${error instanceof Error ? error.message : String(error)}`;
      const processedFiles = new Set([...result.successful, ...result.failed.map(f => f.path)]);

      for (const relativePath of originalStates.keys()) {
        if (!processedFiles.has(relativePath)) {
          result.failed.push({
            path: relativePath,
            error: errorMessage,
          });
        }
      }

      // Log the error but don't throw to avoid masking the original error
      console.warn(chalk.yellow(`   Warning: Repository-level rollback error: ${errorMessage}`));
    }

    return result;
  }
}
