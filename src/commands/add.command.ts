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
   * Execute the add command
   */
  public async execute(filePath: string, options: CommandOptions = {}): Promise<CommandResult> {
    try {
      if (options.verbose) {
        console.log(chalk.blue(`🔄 Adding ${filePath} to private tracking...`));
      }

      // Validate environment
      await this.validateEnvironment();

      // Validate and normalize the file path
      const normalizedPath = await this.validateAndNormalizePath(filePath);

      // Check if already tracked
      await this.checkNotAlreadyTracked(normalizedPath);

      // Execute the add operation atomically
      await this.executeAddOperation(normalizedPath, options);

      return {
        success: true,
        message: `Successfully added ${normalizedPath} to private tracking`,
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
        message: 'Failed to add file to private tracking',
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
   * Validate and normalize the file path
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
   * Check if the path is already being tracked
   */
  private async checkNotAlreadyTracked(relativePath: string): Promise<void> {
    const config = await this.configManager.load();
    
    if (config.trackedPaths.includes(relativePath)) {
      throw new AlreadyTrackedError(`Path is already being tracked: ${relativePath}`);
    }
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
   * Execute the complete add operation atomically
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