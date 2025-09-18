import * as path from 'path';
import { z } from 'zod';
import {
  InvalidInputError,
  UnsafePathError,
  MissingArgumentError,
  InvalidArgumentError,
  SecurityError,
} from '../errors/specific.errors.ts';

/**
 * Path validation result
 */
export interface PathValidationResult {
  isValid: boolean;
  normalizedPath: string;
  issues: string[];
  securityRisk: boolean;
}

/**
 * Command validation options
 */
export interface ValidationOptions {
  allowAbsolutePaths?: boolean;
  allowParentDirectory?: boolean;
  maxPathLength?: number;
  requiredExtensions?: string[];
  blockedPatterns?: RegExp[];
  requireFileExists?: boolean;
}

/**
 * Input validation service for security and data integrity
 */
export class InputValidator {
  // Security patterns to block
  private static readonly DANGEROUS_PATTERNS = [
    /\.\.\//, // Parent directory traversal
    /\.\.\\/, // Windows parent directory traversal
    /^\//, // Absolute Unix paths (when not allowed)
    /^[a-zA-Z]:/, // Windows drive letters (when not allowed)
    /\0/, // Null byte injection
    /[<>:|"*?]/, // Windows forbidden characters
    /^\.+$/, // Only dots (., .., ...)
    /\s$/, // Trailing whitespace
    /^\s/, // Leading whitespace
  ];

  // Blocked directory names
  private static readonly BLOCKED_DIRECTORIES = [
    '.git',
    '.private-storage',
    '.private-config.json',
    'node_modules',
    'System Volume Information',
    '$Recycle.Bin',
    'System32',
  ];

  // Maximum safe path length
  private static readonly MAX_PATH_LENGTH = 255;

  /**
   * Validate file path for security and correctness
   */
  public static validatePath(
    inputPath: string,
    options: ValidationOptions = {},
  ): PathValidationResult {
    const result: PathValidationResult = {
      isValid: true,
      normalizedPath: '',
      issues: [],
      securityRisk: false,
    };

    // Basic validation
    if (!inputPath || typeof inputPath !== 'string') {
      result.isValid = false;
      result.issues.push('Path must be a non-empty string');
      return result;
    }

    // Trim whitespace but preserve if it's significant
    const trimmedPath = inputPath.trim();
    if (trimmedPath !== inputPath) {
      result.issues.push('Path has leading or trailing whitespace');
      result.securityRisk = true;
    }

    // Check length
    const maxLength = options.maxPathLength || this.MAX_PATH_LENGTH;
    if (trimmedPath.length > maxLength) {
      result.isValid = false;
      result.issues.push(`Path exceeds maximum length of ${maxLength} characters`);
      return result;
    }

    // Security pattern checks
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(trimmedPath)) {
        result.isValid = false;
        result.securityRisk = true;
        result.issues.push(`Path contains dangerous pattern: ${pattern.source}`);
      }
    }

    // Check for blocked directory names
    const pathSegments = trimmedPath.split(/[/\\]/);
    for (const segment of pathSegments) {
      if (this.BLOCKED_DIRECTORIES.includes(segment.toLowerCase())) {
        result.isValid = false;
        result.securityRisk = true;
        result.issues.push(`Path contains blocked directory: ${segment}`);
      }
    }

    // Absolute path check
    if (path.isAbsolute(trimmedPath) && !options.allowAbsolutePaths) {
      result.isValid = false;
      result.securityRisk = true;
      result.issues.push('Absolute paths are not allowed');
    }

    // Parent directory traversal check
    const normalized = path.normalize(trimmedPath);
    if (normalized.startsWith('..') && !options.allowParentDirectory) {
      result.isValid = false;
      result.securityRisk = true;
      result.issues.push('Parent directory traversal is not allowed');
    }

    // Extension validation
    if (options.requiredExtensions && options.requiredExtensions.length > 0) {
      const ext = path.extname(normalized).toLowerCase();
      if (!options.requiredExtensions.includes(ext)) {
        result.isValid = false;
        result.issues.push(
          `File must have one of these extensions: ${options.requiredExtensions.join(', ')}`,
        );
      }
    }

    // Custom pattern checks
    if (options.blockedPatterns) {
      for (const pattern of options.blockedPatterns) {
        if (pattern.test(normalized)) {
          result.isValid = false;
          result.issues.push(`Path matches blocked pattern: ${pattern.source}`);
        }
      }
    }

    result.normalizedPath = normalized;
    return result;
  }

  /**
   * Validate commit message
   */
  public static validateCommitMessage(message: string): void {
    if (!message || typeof message !== 'string') {
      throw new MissingArgumentError('Commit message is required', 'commit');
    }

    const trimmed = message.trim();
    if (trimmed.length < 3) {
      throw new InvalidArgumentError('Commit message must be at least 3 characters', 'commit');
    }

    if (trimmed.length > 500) {
      throw new InvalidArgumentError('Commit message must not exceed 500 characters', 'commit');
    }

    // Check for dangerous characters
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0E-\x1F\x7F]/.test(trimmed)) {
      throw new SecurityError('Commit message contains invalid control characters', 'commit');
    }
  }

  /**
   * Validate branch name
   */
  public static validateBranchName(branchName: string): void {
    if (!branchName || typeof branchName !== 'string') {
      throw new MissingArgumentError('Branch name is required', 'branch');
    }

    const trimmed = branchName.trim();

    // Git branch name rules
    const validBranchName = /^[a-zA-Z0-9._/-]+$/;
    if (!validBranchName.test(trimmed)) {
      throw new InvalidArgumentError('Branch name contains invalid characters', 'branch');
    }

    // Additional Git restrictions
    if (trimmed.startsWith('-') || trimmed.endsWith('.') || trimmed.includes('..')) {
      throw new InvalidArgumentError('Invalid branch name format', 'branch');
    }

    if (trimmed.length > 250) {
      throw new InvalidArgumentError('Branch name is too long (max 250 characters)', 'branch');
    }
  }

  /**
   * Validate numeric arguments
   */
  public static validateNumber(value: string, field: string, min?: number, max?: number): number {
    const num = parseInt(value, 10);

    if (isNaN(num)) {
      throw new InvalidArgumentError(`${field} must be a valid number`, field);
    }

    if (min !== undefined && num < min) {
      throw new InvalidArgumentError(`${field} must be at least ${min}`, field);
    }

    if (max !== undefined && num > max) {
      throw new InvalidArgumentError(`${field} must be at most ${max}`, field);
    }

    return num;
  }

  /**
   * Validate command options using Zod schema
   */
  public static validateOptions<T>(options: unknown, schema: z.ZodSchema<T>, command: string): T {
    try {
      return schema.parse(options);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
        throw new InvalidInputError(`Invalid options for ${command}: ${issues.join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Sanitize string input for safe processing
   */
  public static sanitizeString(input: string, maxLength = 1000): string {
    if (typeof input !== 'string') {
      throw new InvalidInputError('Input must be a string');
    }

    // Remove control characters except newlines and tabs
    // eslint-disable-next-line no-control-regex
    let sanitized = input.replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '');

    // Trim and limit length
    sanitized = sanitized.trim();
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Validate environment and prerequisites
   */
  public static validateEnvironment(): void {
    // Check Node.js version
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);

    if (major < 18) {
      throw new InvalidInputError(
        `Node.js version ${nodeVersion} is not supported. Minimum required: 18.0.0`,
      );
    }

    // Check platform support
    const supportedPlatforms = ['linux', 'darwin', 'win32'];
    if (!supportedPlatforms.includes(process.platform)) {
      throw new InvalidInputError(`Platform ${process.platform} is not supported`);
    }
  }

  /**
   * Validate working directory safety
   */
  public static validateWorkingDirectory(workingDir: string): void {
    const normalized = path.resolve(workingDir);

    // Check for system directories
    const systemDirs = [
      '/bin',
      '/sbin',
      '/usr/bin',
      '/usr/sbin',
      '/System',
      '/Windows',
      '/Program Files',
      process.env['SystemRoot'] || '',
    ].filter(dir => dir.length > 0);

    for (const systemDir of systemDirs) {
      if (normalized.startsWith(path.resolve(systemDir))) {
        throw new SecurityError(`Cannot operate in system directory: ${normalized}`);
      }
    }

    // Check for root directory
    if (normalized === '/' || /^[A-Z]:\\?$/.test(normalized)) {
      throw new SecurityError('Cannot operate in root directory');
    }
  }

  /**
   * Create safe file path within working directory
   */
  public static createSafePath(workingDir: string, relativePath: string): string {
    const validation = this.validatePath(relativePath, {
      allowAbsolutePaths: false,
      allowParentDirectory: false,
    });

    if (!validation.isValid) {
      if (validation.securityRisk) {
        throw new UnsafePathError(relativePath, validation.issues.join(', '));
      } else {
        throw new InvalidInputError(`Invalid path: ${validation.issues.join(', ')}`);
      }
    }

    const safePath = path.resolve(workingDir, validation.normalizedPath);

    // Ensure the resolved path is still within the working directory
    if (!safePath.startsWith(path.resolve(workingDir))) {
      throw new UnsafePathError(relativePath, 'Path escapes working directory');
    }

    return safePath;
  }
}

/**
 * Zod schemas for common validation patterns
 */
export const ValidationSchemas = {
  /**
   * Basic command options
   */
  basicOptions: z.object({
    verbose: z.boolean().optional(),
  }),

  /**
   * Log command options
   */
  logOptions: z.object({
    verbose: z.boolean().optional(),
    maxCount: z.number().min(1).max(1000).optional(),
    oneline: z.boolean().optional(),
  }),

  /**
   * Diff command options
   */
  diffOptions: z.object({
    verbose: z.boolean().optional(),
    cached: z.boolean().optional(),
    nameOnly: z.boolean().optional(),
  }),

  /**
   * Branch command options
   */
  branchOptions: z.object({
    verbose: z.boolean().optional(),
    create: z.boolean().optional(),
  }),

  /**
   * Commit options
   */
  commitOptions: z.object({
    verbose: z.boolean().optional(),
    message: z.string().min(3).max(500).optional(),
  }),

  /**
   * Cleanup options
   */
  cleanupOptions: z.object({
    verbose: z.boolean().optional(),
    force: z.boolean().optional(),
  }),
};
