import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { PlatformDetector } from '../utils/platform.detector';
import {
  FileSystemError,
  InvalidPathError,
  PermissionError,
  FileNotFoundError,
  AtomicOperationError,
} from '../errors/filesystem.error';

/**
 * Atomic file system operations with rollback capability
 */
export class FileSystemService {
  private readonly rollbackActions: Array<() => Promise<void>> = [];

  /**
   * Move file or directory atomically with rollback support
   */
  public async moveFileAtomic(source: string, target: string): Promise<void> {
    await this.validatePath(source);
    await this.validateTargetPath(target);

    const backupPath = await this.createBackup(source);
    this.addRollbackAction(async () => {
      if (await fs.pathExists(backupPath)) {
        // Remove existing source first if it exists during rollback
        if (await fs.pathExists(source)) {
          await fs.remove(source);
        }
        await fs.move(backupPath, source);
      }
    });

    try {
      await fs.ensureDir(path.dirname(target));

      // Use a more robust move operation to handle fs-extra quirks
      let moveSuccessful = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!moveSuccessful && retryCount < maxRetries) {
        try {
          // Remove target file if it exists to avoid 'dest already exists' error
          if (await fs.pathExists(target)) {
            await fs.remove(target);
            // Add a small delay to ensure file is fully removed
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          await fs.move(source, target);
          moveSuccessful = true;
        } catch (moveError) {
          retryCount++;

          if (retryCount >= maxRetries) {
            throw moveError;
          }

          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 50 * retryCount));
        }
      }

      // Clean up backup on success
      if (await fs.pathExists(backupPath)) {
        await fs.remove(backupPath);
      }
    } catch (error) {
      await this.rollback();
      throw new AtomicOperationError(
        `Failed to move ${source} to ${target}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Copy file or directory atomically
   */
  public async copyFileAtomic(source: string, target: string): Promise<void> {
    await this.validatePath(source);
    await this.validateTargetPath(target);

    try {
      await fs.ensureDir(path.dirname(target));
      await fs.copy(source, target);
    } catch (error) {
      throw new AtomicOperationError(
        `Failed to copy ${source} to ${target}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Create directory with proper permissions
   */
  public async createDirectory(dirPath: string): Promise<void> {
    this.validatePathString(dirPath);

    try {
      await fs.ensureDir(dirPath);

      // Set appropriate permissions (readable/writable by owner only)
      if (PlatformDetector.isUnix()) {
        await fs.chmod(dirPath, 0o700);
      }
    } catch (error) {
      throw new FileSystemError(
        `Failed to create directory ${dirPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Write file atomically with backup
   */
  public async writeFileAtomic(filePath: string, content: string): Promise<void> {
    this.validatePathString(filePath);

    const tempPath = `${filePath}.tmp.${Date.now()}`;
    const backupPath = await this.createBackupIfExists(filePath);

    if (backupPath) {
      this.addRollbackAction(async () => {
        if (await fs.pathExists(backupPath)) {
          // Remove existing file first if it exists during rollback
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
          }
          await fs.move(backupPath, filePath);
        }
      });
    }

    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(tempPath, content, 'utf8');

      // Remove target file if it exists to avoid 'dest already exists' error
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }

      // Use a more robust move operation to handle fs-extra quirks
      let moveSuccessful = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!moveSuccessful && retryCount < maxRetries) {
        try {
          // Remove target file if it exists to avoid 'dest already exists' error
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            // Add a small delay to ensure file is fully removed
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          await fs.move(tempPath, filePath);
          moveSuccessful = true;
        } catch (moveError) {
          retryCount++;

          if (retryCount >= maxRetries) {
            throw moveError;
          }

          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 50 * retryCount));
        }
      }

      // Set appropriate permissions
      if (PlatformDetector.isUnix()) {
        await fs.chmod(filePath, 0o600);
      }

      // Clean up backup on success
      if (backupPath && (await fs.pathExists(backupPath))) {
        await fs.remove(backupPath);
      }
    } catch (error) {
      // Clean up temp file
      if (await fs.pathExists(tempPath)) {
        await fs.remove(tempPath);
      }

      await this.rollback();
      throw new AtomicOperationError(
        `Failed to write file ${filePath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Read file safely
   */
  public async readFile(filePath: string): Promise<string> {
    await this.validatePath(filePath);

    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new FileNotFoundError(`File not found: ${filePath}`);
      }
      throw new FileSystemError(
        `Failed to read file ${filePath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Remove file or directory safely
   */
  public async remove(targetPath: string): Promise<void> {
    await this.validatePath(targetPath);

    const backupPath = await this.createBackup(targetPath);
    this.addRollbackAction(async () => {
      if (await fs.pathExists(backupPath)) {
        // Remove existing path first if it exists during rollback
        if (await fs.pathExists(targetPath)) {
          await fs.remove(targetPath);
        }
        await fs.move(backupPath, targetPath);
      }
    });

    try {
      await fs.remove(targetPath);
    } catch (error) {
      await this.rollback();
      throw new FileSystemError(
        `Failed to remove ${targetPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Check if path exists
   */
  public async pathExists(targetPath: string): Promise<boolean> {
    this.validatePathString(targetPath);
    return fs.pathExists(targetPath);
  }

  /**
   * Get file/directory statistics
   */
  public async getStats(targetPath: string): Promise<fs.Stats> {
    await this.validatePath(targetPath);

    try {
      return await fs.stat(targetPath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new FileNotFoundError(`Path not found: ${targetPath}`);
      }
      throw new FileSystemError(
        `Failed to get stats for ${targetPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Get link statistics (for symbolic links, returns stats of the link itself, not the target)
   */
  public async getLinkStats(targetPath: string): Promise<fs.Stats> {
    this.validatePathString(targetPath);

    try {
      return await fs.lstat(targetPath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new FileNotFoundError(`Path not found: ${targetPath}`);
      }
      throw new FileSystemError(
        `Failed to get link stats for ${targetPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Check if path is a directory
   */
  public async isDirectory(targetPath: string): Promise<boolean> {
    try {
      const stats = await this.getStats(targetPath);
      return stats.isDirectory();
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if path is a file
   */
  public async isFile(targetPath: string): Promise<boolean> {
    try {
      const stats = await this.getStats(targetPath);
      return stats.isFile();
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Validate path for security and accessibility
   */
  public async validatePath(targetPath: string): Promise<void> {
    this.validatePathString(targetPath);

    // Check if path exists
    if (!(await fs.pathExists(targetPath))) {
      throw new FileNotFoundError(`Path does not exist: ${targetPath}`);
    }

    // Check permissions
    const permissions = await PlatformDetector.checkPermissions(targetPath);
    if (!permissions.readable) {
      throw new PermissionError(`Cannot read path: ${targetPath}`);
    }
  }

  /**
   * Validate path string for security issues
   */
  public validatePathString(targetPath: string): void {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new InvalidPathError('Path must be a non-empty string');
    }

    // Prevent path traversal attacks
    const normalizedPath = path.normalize(targetPath);
    if (normalizedPath.includes('..')) {
      throw new InvalidPathError(`Path traversal detected: ${targetPath}`);
    }

    // Prevent access to system files
    const systemPaths = ['.git', 'node_modules', '.npm', '.cache'];
    const pathParts = normalizedPath.split(path.sep);

    for (const systemPath of systemPaths) {
      if (pathParts.includes(systemPath) && !pathParts.includes('.private-storage')) {
        throw new InvalidPathError(`Access to system path not allowed: ${targetPath}`);
      }
    }
  }

  /**
   * Validate target path for write operations
   */
  private async validateTargetPath(targetPath: string): Promise<void> {
    this.validatePathString(targetPath);

    const targetDir = path.dirname(targetPath);

    // Check if parent directory exists and is writable
    if (await fs.pathExists(targetDir)) {
      const permissions = await PlatformDetector.checkPermissions(targetDir);
      if (!permissions.writable) {
        throw new PermissionError(`Cannot write to directory: ${targetDir}`);
      }
    }
  }

  /**
   * Create backup of file/directory
   */
  private async createBackup(targetPath: string): Promise<string> {
    const backupPath = `${targetPath}.backup.${Date.now()}.${this.generateId()}`;

    if (await fs.pathExists(targetPath)) {
      await fs.copy(targetPath, backupPath);
    }

    return backupPath;
  }

  /**
   * Create backup only if file exists
   */
  private async createBackupIfExists(targetPath: string): Promise<string | null> {
    if (await fs.pathExists(targetPath)) {
      return this.createBackup(targetPath);
    }
    return null;
  }

  /**
   * Add rollback action
   */
  private addRollbackAction(action: () => Promise<void>): void {
    this.rollbackActions.push(action);
  }

  /**
   * Execute rollback actions in reverse order
   */
  private async rollback(): Promise<void> {
    const actions = [...this.rollbackActions].reverse();
    this.rollbackActions.length = 0; // Clear actions

    for (const action of actions) {
      try {
        await action();
      } catch (error) {
        // Log rollback errors but don't throw to avoid masking original error
        console.error('Rollback action failed:', error);
        // Continue with other rollback actions even if one fails
      }
    }
  }

  /**
   * Generate unique identifier
   */
  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Clear rollback actions (call after successful operation)
   */
  public clearRollbackActions(): void {
    this.rollbackActions.length = 0;
  }

  /**
   * Get safe file name for current platform
   */
  public static getSafeFileName(name: string): string {
    // Remove or replace unsafe characters
    let safeName = name.replace(/[<>:"/\\|?*]/g, '_');

    // Ensure it's not too long
    if (safeName.length > 255) {
      safeName = safeName.substring(0, 255);
    }

    // Ensure it's not empty
    if (!safeName.trim()) {
      safeName = 'unnamed';
    }

    return safeName;
  }

  /**
   * Get relative path between two paths
   */
  public static getRelativePath(from: string, to: string): string {
    return path.relative(from, to);
  }

  /**
   * Join paths in platform-appropriate way
   */
  public static joinPaths(...paths: string[]): string {
    return path.join(...paths);
  }

  /**
   * Resolve path to absolute path
   */
  public static resolvePath(targetPath: string): string {
    return path.resolve(targetPath);
  }
}
