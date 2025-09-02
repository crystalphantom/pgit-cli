import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Platform detection and cross-platform utilities
 */
export class PlatformDetector {
  /**
   * Check if running on Windows
   */
  public static isWindows(): boolean {
    return process.platform === 'win32';
  }

  /**
   * Check if running on macOS
   */
  public static isMacOS(): boolean {
    return process.platform === 'darwin';
  }

  /**
   * Check if running on Linux
   */
  public static isLinux(): boolean {
    return process.platform === 'linux';
  }

  /**
   * Check if running on Unix-like system (macOS or Linux)
   */
  public static isUnix(): boolean {
    return this.isMacOS() || this.isLinux();
  }

  /**
   * Get platform-specific path separator
   */
  public static getPathSeparator(): string {
    return this.isWindows() ? '\\' : '/';
  }

  /**
   * Get platform name for display
   */
  public static getPlatformName(): string {
    if (this.isWindows()) return 'Windows';
    if (this.isMacOS()) return 'macOS';
    if (this.isLinux()) return 'Linux';
    return 'Unknown';
  }

  /**
   * Check if the system supports symbolic links
   */
  public static async supportsSymlinks(): Promise<boolean> {
    if (this.isUnix()) {
      // Unix systems generally support symbolic links
      return true;
    }

    if (this.isWindows()) {
      // Windows requires administrator privileges for symlinks in older versions
      // Try to create a test symlink to check
      return this.testSymlinkCapability();
    }

    return false;
  }

  /**
   * Test symbolic link capability by attempting to create one
   */
  private static async testSymlinkCapability(): Promise<boolean> {
    const testDir = os.tmpdir();
    const testSource = path.join(testDir, `private-git-test-${Date.now()}.txt`);
    const testTarget = path.join(testDir, `private-git-test-link-${Date.now()}.txt`);

    try {
      // Create test file
      await fs.promises.writeFile(testSource, 'test');
      
      // Try to create symbolic link
      await fs.promises.symlink(testSource, testTarget);
      
      // Clean up
      await fs.promises.unlink(testTarget);
      await fs.promises.unlink(testSource);
      
      return true;
    } catch (error) {
      // Clean up on error
      try {
        await fs.promises.unlink(testSource);
      } catch {
        // Ignore cleanup errors
      }
      try {
        await fs.promises.unlink(testTarget);
      } catch {
        // Ignore cleanup errors
      }
      return false;
    }
  }

  /**
   * Get platform-specific command for creating symbolic links
   */
  public static getSymlinkCommand(source: string, target: string, isDirectory = false): string {
    if (this.isWindows()) {
      // Windows uses mklink
      const flag = isDirectory ? '/D' : '';
      return `mklink ${flag} "${target}" "${source}"`;
    } else {
      // Unix systems use ln -s
      return `ln -s "${source}" "${target}"`;
    }
  }

  /**
   * Get platform-specific home directory
   */
  public static getHomeDirectory(): string {
    return os.homedir();
  }

  /**
   * Get platform-specific temporary directory
   */
  public static getTempDirectory(): string {
    return os.tmpdir();
  }

  /**
   * Normalize path for current platform
   */
  public static normalizePath(inputPath: string): string {
    return path.normalize(inputPath);
  }

  /**
   * Convert path to platform-specific format
   */
  public static toPlatformPath(inputPath: string): string {
    if (this.isWindows()) {
      return inputPath.replace(/\//g, '\\');
    } else {
      return inputPath.replace(/\\/g, '/');
    }
  }

  /**
   * Check if path is absolute
   */
  public static isAbsolutePath(inputPath: string): boolean {
    return path.isAbsolute(inputPath);
  }

  /**
   * Get current working directory
   */
  public static getCurrentDirectory(): string {
    return process.cwd();
  }

  /**
   * Check file/directory permissions
   */
  public static async checkPermissions(filePath: string): Promise<{
    readable: boolean;
    writable: boolean;
    executable: boolean;
  }> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      
      const readable = await this.hasPermission(filePath, fs.constants.R_OK);
      const writable = await this.hasPermission(filePath, fs.constants.W_OK);
      const executable = await this.hasPermission(filePath, fs.constants.X_OK);

      return { readable, writable, executable };
    } catch {
      return { readable: false, writable: false, executable: false };
    }
  }

  /**
   * Check specific permission
   */
  private static async hasPermission(filePath: string, mode: number): Promise<boolean> {
    try {
      await fs.promises.access(filePath, mode);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get system information for debugging
   */
  public static getSystemInfo(): {
    platform: string;
    arch: string;
    nodeVersion: string;
    osRelease: string;
    supportsSymlinks: boolean;
  } {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      osRelease: os.release(),
      supportsSymlinks: false, // Will be set async
    };
  }
}