import * as fs from 'fs-extra';
import * as path from 'path';
import { PlatformDetector } from '../utils/platform.detector.ts';
import { FileSystemService } from './filesystem.service.ts';
import { BaseError } from '../errors/base.error.ts';
import { run_in_terminal } from '../utils/command.executor.ts';

/**
 * Symbolic link service errors
 */
export class SymlinkError extends BaseError {
  public readonly code = 'SYMLINK_ERROR';
  public readonly recoverable = true;
}

export class SymlinkCreateError extends BaseError {
  public readonly code = 'SYMLINK_CREATE_ERROR';
  public readonly recoverable = true;
}

export class SymlinkValidationError extends BaseError {
  public readonly code = 'SYMLINK_VALIDATION_ERROR';
  public readonly recoverable = true;
}

/**
 * Symbolic link information
 */
export interface SymlinkInfo {
  /** Path to the symbolic link */
  linkPath: string;
  /** Target path that the link points to */
  targetPath: string;
  /** Whether the link exists */
  exists: boolean;
  /** Whether the link is valid (target exists) */
  isValid: boolean;
  /** Whether the link is healthy (exists and valid) */
  isHealthy: boolean;
  /** Any issues with the link */
  issues: string[];
}

/**
 * Symbolic link creation options
 */
export interface SymlinkOptions {
  /** Force creation (overwrite existing) */
  force?: boolean;
  /** Create parent directories if they don't exist */
  createParents?: boolean;
  /** Whether target is a directory */
  isDirectory?: boolean;
}

/**
 * Platform-specific symbolic link service
 */
export class SymlinkService {
  private readonly fileSystem: FileSystemService;

  constructor(fileSystem?: FileSystemService) {
    this.fileSystem = fileSystem || new FileSystemService();
  }

  /**
   * Create a symbolic link
   */
  public async create(
    targetPath: string,
    linkPath: string,
    options: SymlinkOptions = {},
  ): Promise<void> {
    try {
      // Validate inputs
      await this.validateCreateParameters(targetPath, linkPath, options);

      // Create parent directories if needed
      if (options.createParents) {
        await this.fileSystem.createDirectory(path.dirname(linkPath));
      }

      // Remove existing link if force is specified
      const linkExists = await this.fileSystem.pathExists(linkPath);
      if (options.force && linkExists) {
        await this.fileSystem.remove(linkPath);
      }

      // Create platform-specific symbolic link
      if (PlatformDetector.isWindows()) {
        await this.createWindowsSymlink(targetPath, linkPath, options.isDirectory);
      } else {
        await this.createUnixSymlink(targetPath, linkPath);
      }

      // Verify the link was created successfully
      await this.validateLink(linkPath, targetPath);
    } catch (error) {
      throw new SymlinkCreateError(
        `Failed to create symbolic link from ${linkPath} to ${targetPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Validate if a symbolic link is healthy
   */
  public async validate(linkPath: string): Promise<SymlinkInfo> {
    const info: SymlinkInfo = {
      linkPath,
      targetPath: '',
      exists: false,
      isValid: false,
      isHealthy: false,
      issues: [],
    };

    try {
      // Check if link exists
      info.exists = await this.fileSystem.pathExists(linkPath);

      if (!info.exists) {
        info.issues.push('Symbolic link does not exist');
        return info;
      }

      // Check if it's actually a symbolic link
      const stats = await this.fileSystem.getLinkStats(linkPath);
      if (!stats.isSymbolicLink()) {
        info.issues.push('Path exists but is not a symbolic link');
        return info;
      }

      // Get target path
      info.targetPath = await fs.readlink(linkPath);

      // Resolve to absolute path if relative
      if (!path.isAbsolute(info.targetPath)) {
        info.targetPath = path.resolve(path.dirname(linkPath), info.targetPath);
      }

      // Check if target exists
      info.isValid = await this.fileSystem.pathExists(info.targetPath);

      if (!info.isValid) {
        info.issues.push('Target file/directory does not exist');
      }

      // Link is healthy if it exists and is valid
      info.isHealthy = info.exists && info.isValid;
    } catch (error) {
      info.issues.push(
        `Error validating symbolic link: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return info;
  }

  /**
   * Repair a broken symbolic link
   */
  public async repair(linkPath: string, newTargetPath: string): Promise<void> {
    try {
      // Remove existing broken link
      if (await this.fileSystem.pathExists(linkPath)) {
        await this.fileSystem.remove(linkPath);
      }

      // Determine if target is a directory
      const isDirectory = await this.fileSystem.isDirectory(newTargetPath);

      // Create new link
      await this.create(newTargetPath, linkPath, {
        force: true,
        createParents: true,
        isDirectory,
      });
    } catch (error) {
      throw new SymlinkError(
        `Failed to repair symbolic link ${linkPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Remove a symbolic link safely
   */
  public async remove(linkPath: string): Promise<void> {
    try {
      const info = await this.validate(linkPath);

      if (!info.exists) {
        return; // Nothing to remove
      }

      // Remove only the link, not the target
      await fs.unlink(linkPath);
    } catch (error) {
      throw new SymlinkError(
        `Failed to remove symbolic link ${linkPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Get the target of a symbolic link
   */
  public async getTarget(linkPath: string): Promise<string> {
    try {
      const info = await this.validate(linkPath);

      if (!info.exists) {
        throw new SymlinkValidationError(`Symbolic link does not exist: ${linkPath}`);
      }

      return info.targetPath;
    } catch (error) {
      throw new SymlinkError(
        `Failed to get target of symbolic link ${linkPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Check if platform supports symbolic links
   */
  public static async supportsSymlinks(): Promise<boolean> {
    return PlatformDetector.supportsSymlinks();
  }

  /**
   * Validate parameters for link creation
   */
  private async validateCreateParameters(
    targetPath: string,
    linkPath: string,
    options: SymlinkOptions,
  ): Promise<void> {
    // Validate paths
    this.fileSystem.validatePathString(targetPath);
    this.fileSystem.validatePathString(linkPath);

    // Check if target exists
    if (!(await this.fileSystem.pathExists(targetPath))) {
      throw new SymlinkValidationError(`Target path does not exist: ${targetPath}`);
    }

    // Check if link already exists and force is not specified
    if (!options.force && (await this.fileSystem.pathExists(linkPath))) {
      throw new SymlinkValidationError(`Link path already exists: ${linkPath}`);
    }

    // Check platform support
    if (!(await SymlinkService.supportsSymlinks())) {
      throw new SymlinkValidationError('Platform does not support symbolic links');
    }
  }

  /**
   * Create Unix-style symbolic link
   */
  private async createUnixSymlink(targetPath: string, linkPath: string): Promise<void> {
    try {
      await fs.symlink(targetPath, linkPath);
    } catch (error) {
      throw new SymlinkCreateError(
        'Failed to create Unix symbolic link',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Create Windows-style symbolic link using mklink
   */
  private async createWindowsSymlink(
    targetPath: string,
    linkPath: string,
    isDirectory?: boolean,
  ): Promise<void> {
    try {
      // Use mklink command for Windows
      const linkType = isDirectory ? '/D' : '';
      const command = `mklink ${linkType} "${linkPath}" "${targetPath}"`;

      const result = await run_in_terminal(command);

      if (result.exitCode !== 0) {
        throw new Error(`mklink command failed: ${result.stderr || result.stdout}`);
      }
    } catch (error) {
      throw new SymlinkCreateError(
        'Failed to create Windows symbolic link',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Validate that a link was created successfully
   */
  private async validateLink(linkPath: string, expectedTarget: string): Promise<void> {
    const info = await this.validate(linkPath);

    if (!info.exists) {
      throw new SymlinkValidationError('Symbolic link was not created');
    }

    if (!info.isValid) {
      throw new SymlinkValidationError('Created symbolic link is invalid (target does not exist)');
    }

    // Normalize paths for comparison - resolve real paths to handle /tmp vs /private/tmp issues
    let normalizedTarget: string;
    let normalizedActualTarget: string;

    try {
      normalizedTarget = await fs.realpath(expectedTarget);
      normalizedActualTarget = await fs.realpath(info.targetPath);
    } catch {
      // If realpath fails, fall back to path.resolve
      normalizedTarget = path.resolve(expectedTarget);
      normalizedActualTarget = path.resolve(info.targetPath);
    }

    if (normalizedActualTarget !== normalizedTarget) {
      throw new SymlinkValidationError(
        `Symbolic link target mismatch. Expected: ${normalizedTarget}, Actual: ${normalizedActualTarget}`,
      );
    }
  }
}
