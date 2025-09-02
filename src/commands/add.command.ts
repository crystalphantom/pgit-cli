import * as path from 'path';
import chalk from 'chalk';
import { 
  CommandResult, 
  CommandOptions, 
  DEFAULT_PATHS 
} from '../types/config.types';
import { ConfigManager } from '../core/config.manager';
import { FileSystemService } from '../core/filesystem.service';
import { GitService } from '../core/git.service';
import { SymlinkService } from '../core/symlink.service';
import { BaseError } from '../errors/base.error';
import { InputValidator } from '../utils/input.validator';
import { PathNotFoundError, UnsafePathError, InvalidInputError } from '../errors/specific.errors';

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
   * Execute the add command for single or multiple files
   */
  public async execute(filePaths: string | string[], options: CommandOptions = {}): Promise<CommandResult> {
    try {
      // Handle both single and multiple file inputs
      const pathsArray = Array.isArray(filePaths) ? filePaths : [filePaths];
      
      // Limit the number of files that can be processed in a single batch
      const MAX_BATCH_SIZE = 100;
      if (pathsArray.length > MAX_BATCH_SIZE) {
        throw new AddError(`Cannot process more than ${MAX_BATCH_SIZE} files in a single operation. Please split your request into smaller batches.`);
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
        const errorMessages = validationResult.invalidPaths.map(item => 
          `${item.path}: ${item.error}`
        ).join('\n');
        
        if (pathsArray.length === 1) {
          throw new InvalidInputError(`Invalid path detected:\n${errorMessages}`);
        } else {
          throw new BatchOperationError(
            `Invalid paths detected in batch operation:\n${errorMessages}`,
            validationResult.invalidPaths.map(item => item.path),
            validationResult.validPaths
          );
        }
      }
      
      // Check for already tracked paths
      if (validationResult.alreadyTracked.length > 0) {
        if (pathsArray.length === 1) {
          throw new AlreadyTrackedError(
            `Path is already tracked: ${validationResult.alreadyTracked[0]}`
          );
        } else {
          throw new BatchOperationError(
            `The following paths are already tracked: ${validationResult.alreadyTracked.join(', ')}`,
            validationResult.alreadyTracked,
            validationResult.validPaths
          );
        }
      }

      // Execute the add operation atomically for all files
      await this.executeMultipleAddOperation(validationResult.normalizedPaths, options);

      const successMessage = pathsArray.length === 1 
        ? `Successfully added ${validationResult.normalizedPaths[0]} to private tracking`
        : `Successfully added ${validationResult.normalizedPaths.length} files to private tracking`;
      
      return {
        success: true,
        message: successMessage,
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
    // Check if private git tracking is initialized
    if (!await this.configManager.exists()) {
      throw new NotInitializedError(
        'Private git tracking is not initialized. Run "private init" first.'
      );
    }

    // Check if symbolic links are supported
    if (!await SymlinkService.supportsSymlinks()) {
      throw new AddError(
        'This platform does not support symbolic links, which are required for private file tracking.'
      );
    }

    // Check if private storage directory exists
    const storagePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
    if (!await this.fileSystem.pathExists(storagePath)) {
      throw new AddError(
        'Private storage directory does not exist. The initialization may have failed.'
      );
    }
  }

  /**
   * Validate and normalize multiple file paths
   */
  private async validateAndNormalizeMultiplePaths(filePaths: string[]): Promise<MultiPathValidationResult> {
    const result: MultiPathValidationResult = {
      validPaths: [],
      invalidPaths: [],
      normalizedPaths: [],
      alreadyTracked: [],
    };

    // Remove duplicates while preserving order
    const uniquePaths = [...new Set(filePaths)];
    
    // Load config once for efficiency
    const config = await this.configManager.load();
    
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
    if (!await this.fileSystem.pathExists(safePath)) {
      throw new PathNotFoundError(`Path does not exist: ${filePath}`);
    }

    // Convert back to relative path for storage
    const relativePath = path.relative(this.workingDir, safePath);
    
    return relativePath;
  }

  /**
   * Get the current git state of a file
   */
  private async getFileGitState(relativePath: string): Promise<{ isTracked: boolean; isStaged: boolean }> {
    try {
      const gitService = new GitService(this.workingDir, this.fileSystem);
      
      if (!await gitService.isRepository()) {
        return { isTracked: false, isStaged: false };
      }

      const status = await gitService.getStatus();
      const fileStatus = status.files.find(file => file.path === relativePath);
      
      if (!fileStatus) {
        return { isTracked: false, isStaged: false };
      }

      // Check if file is tracked (in index) and/or staged
      const isTracked = !fileStatus.index || fileStatus.index !== '?';
      const isStaged = !!(fileStatus.index && fileStatus.index !== ' ' && fileStatus.index !== '?');
      
      return { isTracked, isStaged };
    } catch {
      return { isTracked: false, isStaged: false };
    }
  }

  /**
   * Execute atomic add operation for multiple files
   */
  private async executeMultipleAddOperation(relativePaths: string[], options: CommandOptions): Promise<void> {
    if (relativePaths.length === 0) {
      throw new AddError('No valid paths to process');
    }

    if (relativePaths.length === 1) {
      // Use the existing single file operation for single files
      return this.executeAddOperation(relativePaths[0], options);
    }

    // For multiple files, implement atomic batch operation
    const rollbackActions: Array<() => Promise<void>> = [];
    const processedPaths: string[] = [];
    const originalGitStates = new Map<string, { isTracked: boolean; isStaged: boolean }>();

    try {
      if (options.verbose) {
        console.log(chalk.gray(`   Processing ${relativePaths.length} files atomically...`));
      }

      // Step 1: Record original git states for all files
      for (const relativePath of relativePaths) {
        const originalState = await this.getFileGitState(relativePath);
        originalGitStates.set(relativePath, originalState);
      }

      // Step 2: Remove all files from main git index
      if (options.verbose) {
        console.log(chalk.gray('   Removing files from main git index...'));
      }
      
      for (const relativePath of relativePaths) {
        await this.removeFromMainGitIndex(relativePath);
        processedPaths.push(relativePath);
      }
      
      // Add rollback for all git operations
      rollbackActions.push(async () => {
        for (const relativePath of processedPaths) {
          const originalState = originalGitStates.get(relativePath);
          if (originalState) {
            await this.restoreToOriginalGitState(relativePath, originalState);
          }
        }
      });

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
      const gitService = new GitService(privateStoragePath, this.fileSystem);
      
      if (!await gitService.isRepository()) {
        throw new AddError('Private git repository not found. The initialization may have failed.');
      }

      // Use the new atomic commit method
      const commitHash = await gitService.addFilesAndCommit(
        relativePaths, 
        'Add files to private tracking'
      );
      
      // Add rollback for git operations
      rollbackActions.push(async () => {
        try {
          // Reset the private repository to before the commit
          await gitService.reset('hard', 'HEAD~1');
        } catch {
          // If reset fails, try to remove files individually
          await gitService.removeFromIndex(relativePaths, false);
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
        console.log(chalk.green(`   ✓ Successfully added ${relativePaths.length} files to private tracking`));
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
          console.error(chalk.red(`   Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`));
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

    // Record original git state before making any changes
    const originalGitState = await this.getFileGitState(relativePath);

    try {
      if (options.verbose) {
        console.log(chalk.gray('   Removing from main git index...'));
      }
      
      // Step 1: Remove from main git index (if tracked)
      await this.removeFromMainGitIndex(relativePath);
      rollbackActions.push(async () => {
        // Restore to original git state
        await this.restoreToOriginalGitState(relativePath, originalGitState);
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
        console.log(chalk.gray(`     Target exists: ${await this.fileSystem.pathExists(storagePath)}`));
        console.log(chalk.gray(`     Link exists: ${await this.fileSystem.pathExists(originalPath)}`));
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

      // Step 5: Update configuration
      await this.configManager.addTrackedPath(relativePath);
      rollbackActions.push(async () => {
        // Remove from tracked paths
        try {
          await this.configManager.removeTrackedPath(relativePath);
        } catch {
          // Ignore errors during rollback
        }
      });

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
          console.error(chalk.red(`   Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`));
        }
      }

      throw error;
    }
  }

  /**
   * Remove file from main git index
   */
  private async removeFromMainGitIndex(relativePath: string): Promise<void> {
    try {
      const gitService = new GitService(this.workingDir, this.fileSystem);
      
      if (await gitService.isRepository()) {
        // Check if file is tracked in git
        const status = await gitService.getStatus();
        const isTracked = status.files.some(file => file.path === relativePath);
        
        if (isTracked) {
          // Remove from git index but keep working copy
          await gitService.removeFromIndex(relativePath, true);
        }
      }
    } catch (error) {
      // If this fails, it's not critical since the file might not be in git
      console.warn(chalk.yellow(`   Warning: Could not remove from main git index: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Add file to private git repository
   */
  private async addToPrivateGit(relativePath: string): Promise<void> {
    const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
    const gitService = new GitService(privateStoragePath, this.fileSystem);
    
    if (!await gitService.isRepository()) {
      throw new AddError('Private git repository not found. The initialization may have failed.');
    }

    await gitService.addFiles([relativePath]);
  }

  /**
   * Commit changes to private git repository
   */
  private async commitToPrivateGit(relativePath: string, message: string): Promise<void> {
    const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
    const gitService = new GitService(privateStoragePath, this.fileSystem);
    
    await gitService.commit(`${message}: ${relativePath}`);
  }

  /**
   * Remove file from private git repository (for rollback)
   */
  private async removeFromPrivateGit(relativePath: string): Promise<void> {
    try {
      const privateStoragePath = path.join(this.workingDir, DEFAULT_PATHS.storage);
      const gitService = new GitService(privateStoragePath, this.fileSystem);
      
      await gitService.removeFromIndex(relativePath, false);
    } catch {
      // Ignore errors during rollback
    }
  }

  /**
   * Restore file to its original git state (for rollback)
   */
  private async restoreToOriginalGitState(relativePath: string, originalState: { isTracked: boolean; isStaged: boolean }): Promise<void> {
    try {
      const gitService = new GitService(this.workingDir, this.fileSystem);
      
      if (!await gitService.isRepository()) {
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
      console.warn(chalk.yellow(`   Warning: Could not restore original git state: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}